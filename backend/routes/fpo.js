const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const requireFPO = require('../middleware/requireFPO');

// All FPO routes require:
// 1. auth       — valid JWT token (logged in)
// 2. requireFPO — user.role must be 'fpo_manager' or 'admin' in DB
// Farmers who try to access these get: 403 Access denied.

// ─── GET /fpo/farms ───────────────────────────────────────────────────────────
// Returns all farms under the logged-in FPO manager + their latest soil scan
router.get('/farms', auth, requireFPO, async (req, res) => {
  try {
    const fpo_id = req.user.id; // FPO manager's user ID acts as the FPO identifier

    const result = await pool.query(`
      SELECT
        f.id            AS farm_id,
        f.farm_name,
        f.size_acres,
        f.district,
        f.state,
        u.name          AS farmer_name,
        u.phone         AS farmer_phone,
        ss.crop,
        ss.ph,
        ss.nitrogen,
        ss.phosphorus,
        ss.potassium,
        ss.organic_carbon,
        ss.zinc,
        ss.sulfur,
        ss.iron,
        ss.scanned_at,
        a.soil_health_score,
        a.total_cost
      FROM fpo_members fm
      JOIN farms f        ON f.id = fm.farm_id
      JOIN users u        ON u.id = f.user_id
      LEFT JOIN LATERAL (
        SELECT * FROM soil_scans
        WHERE farm_id = f.id
        ORDER BY scanned_at DESC
        LIMIT 1
      ) ss ON true
      LEFT JOIN LATERAL (
        SELECT * FROM advisories
        WHERE scan_id = ss.id
        ORDER BY generated_at DESC
        LIMIT 1
      ) a ON true
      WHERE fm.fpo_id = $1
      ORDER BY f.farm_name ASC
    `, [fpo_id]);

    return res.status(200).json({
      success: true,
      total_farms: result.rows.length,
      farms: result.rows
    });

  } catch (err) {
    console.error('Error in GET /fpo/farms:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});


// ─── GET /fpo/stats ───────────────────────────────────────────────────────────
// Returns deficiency analytics across all farms in the FPO
// Example: "80% of farms have low Nitrogen"
router.get('/stats', auth, requireFPO, async (req, res) => {
  try {
    const fpo_id = req.user.id;

    // Get latest scan for each farm in this FPO
    const result = await pool.query(`
      SELECT
        ss.nitrogen,
        ss.phosphorus,
        ss.potassium,
        ss.organic_carbon,
        ss.zinc,
        ss.sulfur,
        ss.iron,
        ss.ph,
        ss.crop,
        a.soil_health_score
      FROM fpo_members fm
      JOIN farms f ON f.id = fm.farm_id
      LEFT JOIN LATERAL (
        SELECT * FROM soil_scans
        WHERE farm_id = f.id
        ORDER BY scanned_at DESC
        LIMIT 1
      ) ss ON true
      LEFT JOIN LATERAL (
        SELECT * FROM advisories
        WHERE scan_id = ss.id
        LIMIT 1
      ) a ON true
      WHERE fm.fpo_id = $1 AND ss.id IS NOT NULL
    `, [fpo_id]);

    const farms = result.rows;
    const total = farms.length;

    if (total === 0) {
      return res.status(200).json({
        success: true,
        message: 'No scans found for farms in this FPO',
        total_farms_scanned: 0
      });
    }

    // Count deficiencies across all farms
    const count = (field, threshold) =>
      farms.filter(f => f[field] !== null && f[field] < threshold).length;

    const avgScore = Math.round(
      farms.reduce((sum, f) => sum + (f.soil_health_score || 0), 0) / total
    );

    // Crop distribution
    const cropCount = {};
    farms.forEach(f => {
      if (f.crop) cropCount[f.crop] = (cropCount[f.crop] || 0) + 1;
    });

    const pct = (n) => `${Math.round((n / total) * 100)}%`;

    return res.status(200).json({
      success: true,
      total_farms_scanned: total,
      average_soil_health_score: avgScore,
      deficiency_breakdown: {
        nitrogen_low:      { count: count('nitrogen', 140),      percentage: pct(count('nitrogen', 140)) },
        phosphorus_low:    { count: count('phosphorus', 11),     percentage: pct(count('phosphorus', 11)) },
        potassium_low:     { count: count('potassium', 108),     percentage: pct(count('potassium', 108)) },
        organic_carbon_low:{ count: count('organic_carbon', 0.5),percentage: pct(count('organic_carbon', 0.5)) },
        zinc_deficient:    { count: count('zinc', 0.6),          percentage: pct(count('zinc', 0.6)) },
        sulfur_deficient:  { count: count('sulfur', 10),         percentage: pct(count('sulfur', 10)) },
        iron_deficient:    { count: count('iron', 4.5),          percentage: pct(count('iron', 4.5)) }
      },
      crop_distribution: cropCount
    });

  } catch (err) {
    console.error('Error in GET /fpo/stats:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});


// ─── GET /fpo/export ──────────────────────────────────────────────────────────
// Returns CSV download — FPO manager uses this to place bulk fertilizer orders
router.get('/export', auth, requireFPO, async (req, res) => {
  try {
    const fpo_id = req.user.id;

    const result = await pool.query(`
      SELECT
        f.farm_name,
        f.size_acres,
        f.district,
        u.name          AS farmer_name,
        u.phone         AS farmer_phone,
        ss.crop,
        ss.ph,
        ss.nitrogen,
        ss.phosphorus,
        ss.potassium,
        ss.organic_carbon,
        ss.zinc,
        ss.sulfur,
        ss.iron,
        a.soil_health_score,
        a.total_cost,
        ss.scanned_at
      FROM fpo_members fm
      JOIN farms f        ON f.id = fm.farm_id
      JOIN users u        ON u.id = f.user_id
      LEFT JOIN LATERAL (
        SELECT * FROM soil_scans
        WHERE farm_id = f.id
        ORDER BY scanned_at DESC LIMIT 1
      ) ss ON true
      LEFT JOIN LATERAL (
        SELECT * FROM advisories
        WHERE scan_id = ss.id LIMIT 1
      ) a ON true
      WHERE fm.fpo_id = $1 AND ss.id IS NOT NULL
      ORDER BY f.district, f.farm_name
    `, [fpo_id]);

    // Build CSV
    const headers = [
      'Farm Name', 'Size (Acres)', 'District', 'Farmer Name', 'Phone',
      'Crop', 'pH', 'Nitrogen', 'Phosphorus', 'Potassium',
      'Organic Carbon', 'Zinc', 'Sulfur', 'Iron',
      'Soil Health Score', 'Total Cost (INR)', 'Scan Date'
    ];

    const rows = result.rows.map(r => [
      r.farm_name, r.size_acres, r.district, r.farmer_name, r.farmer_phone,
      r.crop, r.ph, r.nitrogen, r.phosphorus, r.potassium,
      r.organic_carbon, r.zinc, r.sulfur, r.iron,
      r.soil_health_score, r.total_cost,
      r.scanned_at ? new Date(r.scanned_at).toLocaleDateString('en-IN') : ''
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(val => `"${val ?? ''}"`).join(','))
      .join('\n');

    // Send as downloadable CSV file
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="fpo_farm_report.csv"');
    return res.status(200).send(csv);

  } catch (err) {
    console.error('Error in GET /fpo/export:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});



// ─── POST /fpo/farms ──────────────────────────────────────────────────────────
// Create a new farm (farmer or FPO manager)
router.post('/farms', auth, async (req, res) => {
  try {
    const { farm_name, size_acres, district, state } = req.body;
    const result = await pool.query(
      `INSERT INTO farms (user_id, farm_name, size_acres, district, state)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, farm_name`,
      [req.user.id, farm_name || 'My Farm', size_acres || null, district || null, state || null]
    );
    return res.status(201).json({ success: true, farm: result.rows[0] });
  } catch (err) {
    console.error('Error in POST /fpo/farms:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});


// ─── POST /fpo/members ────────────────────────────────────────────────────────
// FPO manager adds a farm to their dashboard
router.post('/members', auth, requireFPO, async (req, res) => {
  try {
    const { farm_id } = req.body;
    if (!farm_id) return res.status(400).json({ success: false, message: 'farm_id required' });

    // Check farm exists
    const farm = await pool.query('SELECT id FROM farms WHERE id = $1', [farm_id]);
    if (farm.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Farm not found' });

    // Avoid duplicates
    const exists = await pool.query(
      'SELECT id FROM fpo_members WHERE fpo_id = $1 AND farm_id = $2',
      [req.user.id, farm_id]
    );
    if (exists.rows.length > 0)
      return res.status(200).json({ success: true, message: 'Farm already in your dashboard' });

    await pool.query(
      'INSERT INTO fpo_members (fpo_id, farm_id) VALUES ($1, $2)',
      [req.user.id, farm_id]
    );
    return res.status(201).json({ success: true, message: 'Farm added to FPO dashboard ✅' });
  } catch (err) {
    console.error('Error in POST /fpo/members:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});


// ─── GET /fpo/district-farms ──────────────────────────────────────────────────
// Returns all farms in the FPO manager's district — so they can add farmers
router.get('/district-farms', auth, requireFPO, async (req, res) => {
  try {
    const fpo_id = req.user.id;
    const userRow = await pool.query('SELECT district, state FROM users WHERE id = $1', [fpo_id]);
    const district = userRow.rows[0]?.district;

    const result = await pool.query(
      `SELECT f.id AS farm_id, f.farm_name, f.size_acres,
              COALESCE(f.district, u.district) AS district,
              u.name AS farmer_name, u.phone AS farmer_phone,
              EXISTS(
                SELECT 1 FROM fpo_members fm
                WHERE fm.fpo_id = $1 AND fm.farm_id = f.id
              ) AS already_added
       FROM farms f
       JOIN users u ON u.id = f.user_id
       WHERE (
         $2::text IS NULL                          -- FPO has no district → show all
         OR COALESCE(f.district, u.district) = $2  -- farm/user district matches FPO
         OR COALESCE(f.district, u.district) IS NULL  -- farm has no district yet → still show
       )
       ORDER BY already_added ASC, f.created_at DESC`,
      [fpo_id, district]
    );
    return res.status(200).json({ success: true, farms: result.rows });
  } catch (err) {
    console.error('Error in GET /fpo/district-farms:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
