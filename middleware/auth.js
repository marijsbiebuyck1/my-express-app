import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-this';

export default function auth(req, res, next) {
  const authHeader = req.get('authorization') || req.get('Authorization') || req.get('x-access-token');
  if (!authHeader) return res.status(401).json({ message: 'Missing Authorization header' });

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
