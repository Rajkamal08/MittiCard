// Migration: add fcm_token column to users table
// FCM token = the unique ID of a farmer's phone device
// Mobile app sends this token after login — backend stores it here

const pool = require('../db');

const migrate = async () => {
  try {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS fcm_token TEXT
    `);
    console.log('✅ fcm_token column added to users table!');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    pool.end();
  }
};

migrate();
