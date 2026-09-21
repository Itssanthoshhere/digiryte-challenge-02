const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-kanban-key-2026';

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function socketAuthMiddleware(socket, next) {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
      socket.handshake.query?.token;

    if (!token) {
      const err = new Error('Authentication required');
      err.data = { code: 'UNAUTHORIZED', message: 'Missing JWT authentication token' };
      return next(err);
    }

    const decoded = verifyToken(token);
    socket.user = {
      userId: decoded.userId || 'anonymous',
      boardId: decoded.boardId || 'default-board',
    };
    next();
  } catch (err) {
    const authErr = new Error('Authentication failed');
    authErr.data = { code: 'UNAUTHORIZED', message: 'Invalid or expired JWT token' };
    return next(authErr);
  }
}

module.exports = {
  JWT_SECRET,
  generateToken,
  verifyToken,
  socketAuthMiddleware,
};
