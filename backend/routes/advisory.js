const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const { generateAdvisory } = require('../engine/advisor');
const { validateSoilInput } = require('../engine/validate');
const { extractSoilFromImage } = require('../engine/ocrExtractor');

// ─── Helper: auto-create default farm for user if none exists ─────────────────
// Ensures every scan is linked to a farm → FPO dashboard always has data
const getOrCreateFarm = async (userId, district, state) => {
  const existing = await pool.query(
    'SELECT id FROM farms WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
    [userId]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const result = await pool.query(
    `INSERT INTO farms (user_id, farm_name, district, state)
     VALUES ($1, 'My Farm', $2, $3) RETURNING id`,
    [userId, district || null, state || null]
  );
  return result.rows[0].id;
};

// ─── Safe sowing date parser ─────────────────────────────────────────────────────
// Converts DD/MM/YYYY → YYYY-MM-DD (PostgreSQL DATE format)
// Also accepts YYYY-MM-DD directly. Returns null for anything unreadable.
const parseSowingDate = (raw) => {
  if (!raw) return null;
  const s = String(raw).trim();
  // DD/MM/YYYY
  const ddMM = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddMM) return `${ddMM[3]}-${ddMM[2].padStart(2,'0')}-${ddMM[1].padStart(2,'0')}`;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD-MM-YYYY
  const ddDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddDash) return `${ddDash[3]}-${ddDash[2].padStart(2,'0')}-${ddDash[1].padStart(2,'0')}`;
  console.warn('parseSowingDate: unrecognised format ignored:', s);
  return null;
};

// ─── POST /advisory/manual ─────────────────────────────────────────────────────
// Farmer submits soil values manually → rule engine runs → advisory saved + returned
router.post('/manual', auth, async (req, res) => {
  try {
    const {
      farm_id,
      crop,
      farm_size_acres,
      sowing_date,
      ph,
      nitrogen,
      phosphorus,
      potassium,
      organic_carbon,
      zinc,
      sulfur,
      iron,
      language
    } = req.body;

    // Step 1: Validate input
    const validation = validateSoilInput(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: validation.errors
      });
    }

    const parsedSowingDate = parseSowingDate(sowing_date);

    // Step 2: Auto-create farm if not provided → links scan to FPO dashboard
    const userRow = await pool.query('SELECT district, state FROM users WHERE id = $1', [req.user.id]);
    const resolvedFarmId = farm_id || await getOrCreateFarm(req.user.id, userRow.rows[0]?.district, userRow.rows[0]?.state);

    const scanResult = await pool.query(
      `INSERT INTO soil_scans
        (farm_id, input_method, ph, nitrogen, phosphorus, potassium,
         organic_carbon, zinc, sulfur, iron, crop, sowing_date)
       VALUES ($1, 'manual', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [resolvedFarmId, ph, nitrogen, phosphorus, potassium,
       organic_carbon || null, zinc || null, sulfur || null, iron || null,
       crop, parsedSowingDate]
    );

    const scan_id = scanResult.rows[0].id;

    // Step 3: Run rule engine
    const advisory = generateAdvisory({
      ph, nitrogen, phosphorus, potassium,
      organic_carbon, zinc, sulfur, iron,
      crop, farm_size_acres
    });

    // Step 4: Save advisory to database
    await pool.query(
      `INSERT INTO advisories
        (scan_id, recommendations, soil_health_score, total_cost, language)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        scan_id,
        JSON.stringify(advisory.recommendations),
        advisory.soil_health_score,
        advisory.total_cost_inr,
        language || 'en'
      ]
    );

    // Step 5: Save crop calendar events (safe — never kills the advisory response)
    if (parsedSowingDate && advisory.crop_calendar.length > 0) {
      try {
        const baseSow = new Date(parsedSowingDate + 'T00:00:00Z');
        for (const event of advisory.crop_calendar) {
          const eventDate = new Date(baseSow);
          eventDate.setUTCDate(baseSow.getUTCDate() + (event.days_after_sowing || 0));
          await pool.query(
            `INSERT INTO crop_calendar (scan_id, event_date, event_label)
             VALUES ($1, $2, $3)`,
            [scan_id, eventDate.toISOString().split('T')[0], event.label || event.stage || '']
          );
        }
      } catch (calErr) {
        // Calendar save failed — log but don't kill the advisory response
        console.error('crop_calendar insert warning:', calErr.message);
      }
    }

    // Step 6: Return full advisory to client
    return res.status(200).json({
      success: true,
      scan_id,
      advisory
    });

  } catch (err) {
    console.error('Error in /advisory/manual:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});


// ─── POST /advisory/ocr ────────────────────────────────────────────────────────
// Accepts extracted OCR values (Tesseract runs on mobile, not server)
// Mobile sends the already-extracted soil values — same flow as manual after that
// NOTE: Government SHC Portal API not integrated (no public API available).
//       This endpoint is designed to accept OCR-extracted values from mobile app.
//       Govt API can be plugged in here when officially available.
router.post('/ocr', auth, async (req, res) => {
  // OCR extraction happens on the mobile device using Tesseract.js
  // By the time the request reaches here, soil values are already extracted
  // So the flow is identical to /manual — just the input_method differs
  try {
    const {
      farm_id, crop, farm_size_acres, sowing_date,
      ph, nitrogen, phosphorus, potassium,
      organic_carbon, zinc, sulfur, iron, language
    } = req.body;

    const validation = validateSoilInput(req.body);
    if (!validation.isValid) {
      return res.status(400).json({ success: false, errors: validation.errors });
    }

    const parsedSowingDate2 = parseSowingDate(sowing_date);

    const userRow2 = await pool.query('SELECT district, state FROM users WHERE id = $1', [req.user.id]);
    const resolvedFarmId2 = farm_id || await getOrCreateFarm(req.user.id, userRow2.rows[0]?.district, userRow2.rows[0]?.state);

    const scanResult = await pool.query(
      `INSERT INTO soil_scans
        (farm_id, input_method, ph, nitrogen, phosphorus, potassium,
         organic_carbon, zinc, sulfur, iron, crop, sowing_date)
       VALUES ($1, 'ocr', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [resolvedFarmId2, ph, nitrogen, phosphorus, potassium,
       organic_carbon || null, zinc || null, sulfur || null, iron || null,
       crop, parsedSowingDate2]
    );

    const scan_id = scanResult.rows[0].id;
    const advisory = generateAdvisory({ ph, nitrogen, phosphorus, potassium, organic_carbon, zinc, sulfur, iron, crop, farm_size_acres });

    await pool.query(
      `INSERT INTO advisories (scan_id, recommendations, soil_health_score, total_cost, language)
       VALUES ($1, $2, $3, $4, $5)`,
      [scan_id, JSON.stringify(advisory.recommendations), advisory.soil_health_score, advisory.total_cost_inr, language || 'en']
    );

    if (parsedSowingDate2 && advisory.crop_calendar.length > 0) {
      try {
        const baseSow2 = new Date(parsedSowingDate2 + 'T00:00:00Z');
        for (const event of advisory.crop_calendar) {
          const eventDate = new Date(baseSow2);
          eventDate.setUTCDate(baseSow2.getUTCDate() + (event.days_after_sowing || 0));
          await pool.query(
            `INSERT INTO crop_calendar (scan_id, event_date, event_label) VALUES ($1, $2, $3)`,
            [scan_id, eventDate.toISOString().split('T')[0], event.label || event.stage || '']
          );
        }
      } catch (calErr) {
        console.error('crop_calendar (ocr) insert warning:', calErr.message);
      }
    }

    return res.status(200).json({ success: true, scan_id, advisory });

  } catch (err) {
    console.error('Error in /advisory/ocr:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});


// ─── POST /advisory/ocr-scan ────────────────────────────────────────────────────
// Accepts a base64 image of a Soil Health Card
// Runs Tesseract.js OCR and returns extracted soil values
// Mobile confirms extracted values then submits via /advisory/manual or /advisory/ocr
router.post('/ocr-scan', auth, async (req, res) => {
  try {
    const { image_base64 } = req.body;

    if (!image_base64) {
      return res.status(400).json({ success: false, message: 'image_base64 is required' });
    }

    if (image_base64.length > 10 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'Image too large. Max 10MB.' });
    }

    const extracted = await extractSoilFromImage(image_base64);

    return res.status(200).json({
      success: true,
      extracted: {
        ph:             extracted.ph,
        nitrogen:       extracted.nitrogen,
        phosphorus:     extracted.phosphorus,
        potassium:      extracted.potassium,
        organic_carbon: extracted.organic_carbon,
        confidence:     extracted.confidence,
      },
      raw_text: extracted.rawText,
    });

  } catch (err) {
    console.error('Error in /advisory/ocr-scan:', err.message);
    return res.status(500).json({
      success: false,
      message: 'OCR processing failed',
      error: err.message,           // ← real reason shown in app
      tip: 'First run downloads ~30MB language data. Wait 1 minute then retry.',
    });
  }
});

// ─── GET /advisory/history ──────────────────────────────────────────────────────
// Retrieve all soil scans + advisories registered to the logged-in user
router.get('/history', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.ph, s.nitrogen, s.phosphorus, s.potassium, s.organic_carbon, s.crop, s.sowing_date, s.scanned_at,
              a.soil_health_score, a.total_cost, a.generated_at
       FROM soil_scans s
       JOIN farms f ON s.farm_id = f.id
       JOIN advisories a ON a.scan_id = s.id
       WHERE f.user_id = $1
       ORDER BY s.scanned_at DESC`,
      [req.user.id]
    );
    return res.status(200).json({ success: true, history: result.rows });
  } catch (err) {
    console.error('Error in GET /advisory/history:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// ─── GET /advisory/:id ─────────────────────────────────────────────────────────
// Fetch a previously saved advisory — re-runs engine to get full advisory object
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Get the scan + advisory together
    const result = await pool.query(
      `SELECT s.*, a.recommendations, a.soil_health_score, a.total_cost, a.language, a.generated_at
       FROM soil_scans s
       JOIN advisories a ON a.scan_id = s.id
       WHERE s.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Advisory not found' });
    }

    const scan = result.rows[0];

    // Get crop calendar for this scan
    const calendarResult = await pool.query(
      `SELECT cc.*, cc.event_label AS label,
        CASE WHEN s2.sowing_date IS NOT NULL AND cc.event_date IS NOT NULL
          THEN (cc.event_date - s2.sowing_date)
          ELSE NULL
        END AS days_after_sowing
       FROM crop_calendar cc
       JOIN soil_scans s2 ON s2.id = cc.scan_id
       WHERE cc.scan_id = $1 ORDER BY cc.event_date ASC`,
      [id]
    );

    // Re-run the advisory engine to get full advisory object
    // (nutrient_status, total_cost_inr, budget_tip, etc.)
    let fullAdvisory;
    try {
      fullAdvisory = generateAdvisory({
        ph:             parseFloat(scan.ph),
        nitrogen:       parseFloat(scan.nitrogen),
        phosphorus:     parseFloat(scan.phosphorus),
        potassium:      parseFloat(scan.potassium),
        organic_carbon: parseFloat(scan.organic_carbon) || null,
        zinc:           parseFloat(scan.zinc)    || null,
        sulfur:         parseFloat(scan.sulfur)  || null,
        iron:           parseFloat(scan.iron)    || null,
        crop:           scan.crop,
        farm_size_acres: parseFloat(scan.farm_size_acres) || 1,
      });
    } catch (engineErr) {
      // Fallback to stored data if engine fails
      fullAdvisory = {
        recommendations: typeof scan.recommendations === 'string'
          ? JSON.parse(scan.recommendations)
          : (scan.recommendations || []),
        total_cost_inr: scan.total_cost || 0,
        nutrient_status: {},
        crop_calendar: [],
      };
    }

    // Decide which crop_calendar to use:
    // • If DB has stored events (sowing_date was set), use them — mapped to frontend field names
    // • Otherwise use freshly re-computed calendar (has all enriched fields: stage, details, etc.)
    const dbCalendar = calendarResult.rows;
    const cropCalendar = dbCalendar.length > 0
      ? dbCalendar.map(row => ({
          ...row,
          label:            row.label || row.event_label || '',
          days_after_sowing: row.days_after_sowing !== null
            ? parseInt(row.days_after_sowing, 10)
            : null,
          stage:   row.stage   || 'general',
          weather_sensitive: row.weather_sensitive || false,
        }))
      : (fullAdvisory.crop_calendar || []);

    return res.status(200).json({
      success: true,
      data: {
        ...scan,
        ...fullAdvisory,
        soil_health_score: scan.soil_health_score || fullAdvisory.soil_health_score,
        total_cost_inr:    fullAdvisory.total_cost_inr || scan.total_cost || 0,
        crop_calendar:     cropCalendar,
        sowing_date:       scan.sowing_date,
      }
    });

  } catch (err) {
    console.error('Error in GET /advisory/:id:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// ─── PUT /advisory/:id/sowing-date ──────────────────────────────────────────────
// Update the sowing date of a scan, delete previous calendar items, and populate new ones!
router.put('/:id/sowing-date', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { sowing_date } = req.body;

    const parsedSow = parseSowingDate(sowing_date);
    if (!parsedSow) {
      return res.status(400).json({ success: false, message: 'Invalid date format. Use DD/MM/YYYY or YYYY-MM-DD' });
    }

    // 1. Update the scan with the new sowing date
    await pool.query(
      'UPDATE soil_scans SET sowing_date = $1 WHERE id = $2',
      [parsedSow, id]
    );

    // 2. Delete existing calendar items for this scan
    await pool.query(
      'DELETE FROM crop_calendar WHERE scan_id = $1',
      [id]
    );

    // 3. Retrieve scan details to re-run the advisory rule engine
    const scanQuery = await pool.query('SELECT * FROM soil_scans WHERE id = $1', [id]);
    if (scanQuery.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Scan not found' });
    }
    const scan = scanQuery.rows[0];

    // 4. Generate crop calendar using the rule engine
    const advisory = generateAdvisory({
      ph:             parseFloat(scan.ph),
      nitrogen:       parseFloat(scan.nitrogen),
      phosphorus:     parseFloat(scan.phosphorus),
      potassium:      parseFloat(scan.potassium),
      organic_carbon: parseFloat(scan.organic_carbon) || null,
      zinc:           parseFloat(scan.zinc)    || null,
      sulfur:         parseFloat(scan.sulfur)  || null,
      iron:           parseFloat(scan.iron)    || null,
      crop:           scan.crop,
      farm_size_acres: parseFloat(scan.farm_size_acres) || 1,
    });

    // 5. Save new calendar events
    if (advisory.crop_calendar && advisory.crop_calendar.length > 0) {
      const baseSow = new Date(parsedSow + 'T00:00:00Z');
      for (const event of advisory.crop_calendar) {
        const eventDate = new Date(baseSow);
        eventDate.setUTCDate(baseSow.getUTCDate() + (event.days_after_sowing || 0));
        await pool.query(
          `INSERT INTO crop_calendar (scan_id, event_date, event_label)
           VALUES ($1, $2, $3)`,
          [id, eventDate.toISOString().split('T')[0], event.label || event.stage || '']
        );
      }
    }

    // Return updated data
    return res.status(200).json({
      success: true,
      message: 'Sowing date updated successfully',
      sowing_date: parsedSow,
    });

  } catch (err) {
    console.error('Error in PUT /advisory/:id/sowing-date:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

module.exports = router;

