// middleware/auth.js — JWT auth guard
// Add this to any route that requires login

const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  // Get token from Authorization header: "Bearer <token>"
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided. Please login first.'
    });
  }

  try {
    // Verify token signature + expiry
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;  // Now routes can use req.user.id and req.user.phone
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
    }
    return res.status(403).json({ success: false, message: 'Invalid token.' });
  }
};

module.exports = authMiddleware;
