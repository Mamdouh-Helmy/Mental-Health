import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // ✅ تحقق من وجود التوكن
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    // ✅ تحقق من التوكن وفك التشفير
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('Decoded token:', decoded); // للتصحيح - تحقق من محتوى التوكن
    req.user = { _id: decoded.userId }; // ⬅️ تحويل userId إلى _id للتوافق مع posts.js
    next();
  } catch (err) {
    console.error('Token verification error:', err.message); // للتصحيح
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
};