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
      // fetch the full user from DB to avoid relying solely on token payload
      try {
        const u = await User.findById(payload.id).select('_id name role');
        if (!u) {
          console.error('Auth: token refers to non-existing user id', payload.id);
          return res.status(401).json({ message: 'Invalid token user' });
        }
        // normalize req.user to a plain object with string id
        req.user = { id: u._id.toString(), name: u.name, role: u.role };
        // if a dev X-User-Id header is present, ensure it matches the token-derived user
        const headerUserId = req.get('x-user-id') || req.headers['x-user-id'];
        if (headerUserId && String(headerUserId).trim() !== req.user.id) {
          console.error('Auth: mismatch between Authorization token user and X-User-Id header', { tokenUser: req.user.id, headerUserId });
          return res.status(401).json({ message: 'User header does not match token' });
        }
        return next();
      } catch (e) {
        console.error('Auth lookup failed:', e && e.message);
        return res.status(500).json({ message: 'Auth lookup error' });
      }
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
