import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-this';

export default async function auth(req, res, next) {
  // 1) Try Authorization Bearer token or x-access-token
  const authHeader = req.get('authorization') || req.get('Authorization') || req.get('x-access-token');
  if (authHeader) {
    // Bearer <token>
    const parts = authHeader.split(' ');
    let token = authHeader;
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) token = parts[1];

    try {
      const payload = jwt.verify(token, SECRET);
      // payload should contain { id, name }
      req.user = { id: payload.id, name: payload.name };
      return next();
    } catch (err) {
      console.error('Auth verify failed:', err && err.message);
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
  }

  // 2) Fallback: allow X-User-Id header for quick local testing (dev only)
  // Only allow when NODE_ENV !== 'production'
  const headerUserId = req.get('x-user-id') || req.headers['x-user-id'];
  if (process.env.NODE_ENV !== 'production' && headerUserId) {
    try {
      const u = await User.findById(headerUserId).select('_id name');
      if (!u) return res.status(401).json({ message: 'Invalid X-User-Id' });
      req.user = { id: u._id.toString(), name: u.name };
      return next();
    } catch (err) {
      console.error('Auth fallback user lookup failed:', err && err.message);
      return res.status(500).json({ message: 'Auth lookup error' });
    }
  }

  return res.status(401).json({ message: 'Missing Authorization header' });
}
