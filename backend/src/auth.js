const jwt = require('jsonwebtoken');

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}
const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me'; // development fallback only
const EXPIRY = process.env.JWT_EXPIRY || '8h';

function sign(user) {
  return jwt.sign(
    { id: user.id, name: user.full_name, email: user.email, role: user.role },
    SECRET,
    { expiresIn: EXPIRY }
  );
}

// Authentication: verifies the bearer token and attaches req.user
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Authorisation (RBAC): allows only the listed roles
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Role '${req.user.role}' is not permitted to perform this action` });
    }
    next();
  };
}

module.exports = { sign, authenticate, requireRole };
