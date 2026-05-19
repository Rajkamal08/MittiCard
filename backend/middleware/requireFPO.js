// middleware/requireFPO.js — Role guard for FPO routes
// Blocks access if the logged-in user is not an fpo_manager or admin
// Always stack AFTER auth middleware: router.get('/farms', auth, requireFPO, handler)

const pool = require('../db');

const requireFPO = async (req, res, next) => {
  try {
    // req.user.id is set by the auth middleware (JWT decoded)
    const result = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    const { role } = result.rows[0];

    if (role !== 'fpo_manager' && role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This area is for FPO managers only.',
        your_role: role,
      });
    }

    // Store role on req for downstream use
    req.user.role = role;
    next();
  } catch (err) {
    console.error('requireFPO error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error in role check' });
  }
};

module.exports = requireFPO;
