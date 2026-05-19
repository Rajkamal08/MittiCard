const pool = require('../db');

const migrate = async () => {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'farmer'`);
    console.log('✅ role column added to users table!');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    pool.end();
  }
};

migrate();
