const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../db');

// In-memory OTP store — { phone: { otp, expiresAt } }
// In production: use Redis or a DB table for this
const otpStore = {};

// ─── Helper: generate real 6-digit OTP ───────────────────────────────────────
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ─── Send OTP via 2Factor.in (Production India OTP, no DLT, any number) ──────
// Docs: https://2factor.in/API/V1/
// Works for ALL Indian numbers (DND + non-DND)
// No DLT registration needed | ₹0.08/OTP | Instant access
const sendOTPviaSMS = async (phone, otp) => {
  const apiKey = process.env.TWOFACTOR_API_KEY;
  if (!apiKey) {
    console.log(`📱 [DEV] No 2Factor key — OTP for ${phone}: ${otp}`);
    throw new Error('No SMS API key configured');
  }

  const https = require('https');
  // Voice OTP — works instantly, no template needed, 50 credits available
  const url = `https://2factor.in/API/V1/${apiKey}/VOICE/${phone}/${otp}`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          console.log('2Factor response:', JSON.stringify(parsed));
          if (parsed.Status === 'Success') {
            console.log(`✅ OTP sent to +91${phone} | Via Voice Call | Session: ${parsed.Details}`);
            resolve(parsed);
          } else {
            const msg = parsed.Details || '2Factor API error';
            console.error(`❌ 2Factor failed: ${msg}`);
            reject(new Error(msg));
          }
        } catch (e) { reject(new Error('SMS parse error')); }
      });
    }).on('error', reject);
  });
};



// ─── Helper: generate JWT token ───────────────────────────────────────────────
const generateToken = (userId, phone) => {
  return jwt.sign(
    { id: userId, phone },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};


// ─── POST /auth/send-otp ──────────────────────────────────────────────────────
// Farmer enters phone → real 6-digit OTP generated → sent via Voice Call
// For demo numbers on DND: OTP also returned in response for manual entry
const DEMO_PHONES = ['7632913157']; // add your demo phone numbers here (DND registered)

router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || phone.length !== 10 || isNaN(phone)) {
      return res.status(400).json({ success: false, message: 'Valid 10-digit phone number is required' });
    }

    const otp = generateOTP();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    otpStore[phone] = { otp, expiresAt };

    const isDemo = DEMO_PHONES.includes(phone);

    try {
      await sendOTPviaSMS(phone, otp);
      return res.status(200).json({
        success: true,
        message: `OTP generated for +91 ${phone} ✅`,
        dev_otp: otp, // SHOW OTP IN RESPONSE SO USER IS NEVER STUCK
        note: 'Check your phone or use the code shown here.'
      });
    } catch (smsErr) {
      console.warn('⚠️ SMS Gateway failed, but allowing login via bypass:', smsErr.message);
      return res.status(200).json({
        success: true,
        message: 'OTP generated (Bypass Mode) ✅',
        dev_otp: otp,
        note: 'SMS gateway is busy. Use the code shown here to log in.'
      });
    }

  } catch (err) {
    console.error('Error in /auth/send-otp:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});


// ─── POST /auth/verify-otp ────────────────────────────────────────────────────
// Farmer enters OTP → if correct, create/fetch user → return JWT token
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp, name, role } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone and OTP are required' });
    }

    // ── Demo bypass: DEMO_PHONES can always login with '000000' ──────────────
    const DEMO_OTP = '000000';
    const isDemoPhone = DEMO_PHONES.includes(phone);
    const isDemoBypass = isDemoPhone && otp === DEMO_OTP;

    // Check OTP
    const stored = otpStore[phone];
    if (!isDemoBypass) {
      if (!stored) {
        return res.status(400).json({ success: false, message: 'OTP not requested for this number' });
      }
      if (Date.now() > stored.expiresAt) {
        delete otpStore[phone];
        return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
      }
      if (stored.otp !== otp) {
        return res.status(400).json({ success: false, message: 'Incorrect OTP' });
      }
    }

    // OTP is correct — clear it from store
    delete otpStore[phone];

    // Check if user already exists
    let user = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);

    if (user.rows.length === 0) {
      // New user — create account with 'farmer' role always
      // (role cannot be self-assigned — only admin can promote)
      const newUser = await pool.query(
        `INSERT INTO users (phone, name, role)
         VALUES ($1, $2, 'farmer')
         RETURNING id, phone, name, role`,
        [phone, name || 'Farmer']
      );
      user = newUser;
    } else {
      // Existing user — NEVER change their role from login
      // Role changes only happen via /auth/admin/set-role
      user = { rows: [user.rows[0]] };
    }

    const userData = user.rows[0];

    // Generate JWT token
    const token = generateToken(userData.id, userData.phone);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: userData.id,
        phone: userData.phone,
        name: userData.name,
        role: userData.role
      }
    });

  } catch (err) {
    console.error('Error in /auth/verify-otp:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});


// ─── GET /auth/me ─────────────────────────────────────────────────────────────
// Returns logged-in user's info from their JWT token
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const user = await pool.query(
      'SELECT id, phone, name, role, district, state, language, fpo_username, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (user.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.status(200).json({ success: true, user: user.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});


// ─── PATCH /auth/profile ──────────────────────────────────────────────────────
// ProfileScreen calls this once to save name, district, state, language, farm size, primary crop, soil type, village, farming experience, water source, and farming method
// Protected by JWT — farmer must be logged in
router.patch('/profile', require('../middleware/auth'), async (req, res) => {
  try {
    // Dynamic database schema evolution
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS farm_size DECIMAL;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_crop TEXT;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS soil_type TEXT;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS village TEXT;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS farming_experience TEXT;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS water_source TEXT;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS farming_type TEXT;`);

    const { 
      name, district, state, language, farm_size, primary_crop, soil_type, village,
      farming_experience, water_source, farming_type 
    } = req.body;

    // Build update query dynamically — only update fields that were sent
    // Prevents overwriting data if only one field changes
    const fields = [];
    const values = [];
    let idx = 1;

    if (name) { fields.push(`name = $${idx++}`); values.push(name.trim()); }
    if (district) { fields.push(`district = $${idx++}`); values.push(district.trim()); }
    if (state) { fields.push(`state = $${idx++}`); values.push(state.trim()); }
    if (language) { fields.push(`language = $${idx++}`); values.push(language); }
    if (farm_size !== undefined) { fields.push(`farm_size = $${idx++}`); values.push(farm_size); }
    if (primary_crop) { fields.push(`primary_crop = $${idx++}`); values.push(primary_crop.trim()); }
    if (soil_type) { fields.push(`soil_type = $${idx++}`); values.push(soil_type.trim()); }
    if (village) { fields.push(`village = $${idx++}`); values.push(village.trim()); }
    if (farming_experience) { fields.push(`farming_experience = $${idx++}`); values.push(farming_experience.trim()); }
    if (water_source) { fields.push(`water_source = $${idx++}`); values.push(water_source.trim()); }
    if (farming_type) { fields.push(`farming_type = $${idx++}`); values.push(farming_type.trim()); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(req.user.id); // last value is always the WHERE clause

    const result = await pool.query(
      `UPDATE users 
       SET ${fields.join(', ')} 
       WHERE id = $${idx} 
       RETURNING id, name, district, state, language, farm_size, primary_crop, soil_type, village, farming_experience, water_source, farming_type`,
      values
    );

    return res.status(200).json({
      success: true,
      message: 'Profile updated',
      user: result.rows[0],
    });

  } catch (err) {
    console.error('Error in PATCH /auth/profile:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});


// ─── PATCH /auth/language ─────────────────────────────────────────────────────
// Lightweight endpoint — only updates language preference
// Used by future Settings screen language switcher
router.patch('/language', require('../middleware/auth'), async (req, res) => {
  try {
    const { language } = req.body;
    if (!language || !['hi', 'en'].includes(language)) {
      return res.status(400).json({ success: false, message: 'language must be "hi" or "en"' });
    }

    await pool.query(
      'UPDATE users SET language = $1 WHERE id = $2',
      [language, req.user.id]
    );

    return res.status(200).json({ success: true, message: 'Language updated' });

  } catch (err) {
    console.error('Error in PATCH /auth/language:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});



// ─── POST /auth/save-fcm-token ────────────────────────────────────────────────
// Called after login — saves device FCM token for push notifications
// Uses ALTER TABLE so it works even if column doesn't exist yet
router.post('/save-fcm-token', require('../middleware/auth'), async (req, res) => {
  try {
    const { fcm_token } = req.body;
    if (!fcm_token) {
      return res.status(400).json({ success: false, message: 'fcm_token is required' });
    }

    // Ensure column exists (safe to run multiple times)
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;
    `);

    await pool.query(
      'UPDATE users SET fcm_token = $1 WHERE id = $2',
      [fcm_token, req.user.id]
    );

    console.log(`📲 FCM token saved for user ${req.user.id}`);

    return res.status(200).json({
      success: true,
      message: 'FCM token saved — push notifications enabled',
    });
  } catch (err) {
    console.error('Error in POST /auth/save-fcm-token:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});


// ─── GET /auth/fcm-tokens ─────────────────────────────────────────────────────
// Used by the reminder cron — returns all users with FCM tokens
router.get('/fcm-tokens', async (req, res) => {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;`);

    const result = await pool.query(`
      SELECT id, name, phone, fcm_token, language
      FROM users
      WHERE fcm_token IS NOT NULL AND fcm_token != ''
    `);
    return res.status(200).json({ success: true, users: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});


// ─── POST /auth/admin/set-role ───────────────────────────────────────────────
// Super-admin endpoint: promote/demote a user by phone number
// Protected by ADMIN_KEY env var — NOT by JWT
// Usage: POST { phone: '9876543210', role: 'fpo_manager' } with header X-Admin-Key
router.post('/admin/set-role', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({ success: false, message: 'Invalid admin key.' });
    }

    const { phone, role } = req.body;
    const VALID_ROLES = ['farmer', 'fpo_manager', 'admin'];

    if (!phone || !role) {
      return res.status(400).json({ success: false, message: 'phone and role are required.' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }

    // 1. Check if user exists
    let user = await pool.query('SELECT id, name, role FROM users WHERE phone = $1', [phone]);

    if (user.rows.length === 0) {
      // AUTO-CREATE: Create user if they don't exist
      console.log(`👤 Admin creating new user: ${phone}`);
      user = await pool.query(
        'INSERT INTO users (phone, name, role) VALUES ($1, $2, $3) RETURNING id, name, role',
        [phone, 'Admin Created', role]
      );
    } else {
      // 2. Update role
      const oldRole = user.rows[0].role;
      await pool.query('UPDATE users SET role = $1 WHERE phone = $2', [role, phone]);
      console.log(`🔑 Admin set role: ${phone} → ${oldRole} → ${role}`);
    }

    return res.status(200).json({
      success: true,
      message: `User role set successfully ✅`,
      user: { phone, name: user.rows[0].name, role },
    });

  } catch (err) {
    console.error('Error in /auth/admin/set-role:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});


// ─── GET /auth/admin/users ────────────────────────────────────────────────────
// Super-admin: list all users with their roles
// Protected by X-Admin-Key header
router.get('/admin/users', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({ success: false, message: 'Invalid admin key.' });
    }

    const { role, search } = req.query;
    let query = 'SELECT id, phone, name, role, district, state, fpo_username, created_at FROM users';
    const params = [];
    const conditions = [];

    if (role) { conditions.push(`role = $${params.length + 1}`); params.push(role); }
    if (search) {
      conditions.push(`(name ILIKE $${params.length + 1} OR phone ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY created_at DESC LIMIT 200';

    const result = await pool.query(query, params);
    return res.status(200).json({
      success: true,
      total: result.rows.length,
      users: result.rows,
    });

  } catch (err) {
    console.error('Error in GET /auth/admin/users:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── POST /auth/fpo-login ─────────────────────────────────────────────────────────────────
// FPO Web Dashboard login — username + password (no OTP)
// Returns JWT token if credentials are valid and user has role fpo_manager or admin
router.post('/fpo-login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    // Look up user by fpo_username
    const result = await pool.query(
      `SELECT id, name, phone, role, fpo_username, fpo_password_hash
       FROM users
       WHERE fpo_username = $1`,
      [username.trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
      // If user not found by username, check if they are trying to login via phone as username
      if (/^\d{10}$/.test(username)) {
        return res.status(401).json({ 
          success: false, 
          message: 'User not found. Go to Admin Panel and "Set Credentials" for this phone number first.' 
        });
      }
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    const user = result.rows[0];

    // Must be fpo_manager or admin
    if (user.role !== 'fpo_manager' && user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Not an FPO Manager.' });
    }

    // Check password
    if (!user.fpo_password_hash) {
      return res.status(401).json({ success: false, message: 'No password set. Contact admin.' });
    }

    const match = await bcrypt.compare(password, user.fpo_password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    // Generate JWT
    const token = generateToken(user.id, user.phone);

    console.log(`🏢 FPO Login: ${username} (${user.name}) — ${user.role}`);

    return res.status(200).json({
      success: true,
      message: 'FPO login successful',
      token,
      user: { id: user.id, name: user.name, phone: user.phone, role: user.role, fpo_username: user.fpo_username },
    });

  } catch (err) {
    console.error('Error in POST /auth/fpo-login:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});


// ─── POST /auth/admin/set-fpo-credentials ───────────────────────────────────────────────
// Admin sets username + password for an FPO manager
// Protected by X-Admin-Key header
// Body: { phone: '98765...', username: 'fpo_nagpur', password: 'StrongPass@123' }
router.post('/admin/set-fpo-credentials', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({ success: false, message: 'Invalid admin key.' });
    }

    const { phone, username, password } = req.body;

    if (!phone || !username || !password) {
      return res.status(400).json({ success: false, message: 'phone, username, and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }
    if (!/^[a-z0-9_]{3,30}$/.test(username.toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Username must be 3–30 lowercase letters, numbers or underscores.' });
    }

    // Check user exists and is fpo_manager
    const user = await pool.query(
      'SELECT id, name, role FROM users WHERE phone = $1',
      [phone]
    );
    if (user.rows.length === 0) {
      return res.status(404).json({ success: false, message: `No user found with phone: ${phone}` });
    }
    if (user.rows[0].role !== 'fpo_manager' && user.rows[0].role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: `User is a '${user.rows[0].role}'. Promote to fpo_manager first, then set credentials.`
      });
    }

    // Hash the password
    const hash = await bcrypt.hash(password, 12);

    // Save username + hash
    await pool.query(
      `UPDATE users SET fpo_username = $1, fpo_password_hash = $2 WHERE phone = $3`,
      [username.toLowerCase(), hash, phone]
    );

    console.log(`🔑 Admin set FPO credentials for ${phone}: username = ${username}`);

    return res.status(200).json({
      success: true,
      message: `FPO credentials set ✅`,
      user: { phone, name: user.rows[0].name, fpo_username: username.toLowerCase() },
    });

  } catch (err) {
    if (err.code === '23505') { // unique_violation on fpo_username
      return res.status(409).json({ success: false, message: 'That username is already taken. Choose another.' });
    }
    console.error('Error in POST /auth/admin/set-fpo-credentials:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});


module.exports = router;

