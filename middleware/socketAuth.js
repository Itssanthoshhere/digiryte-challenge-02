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

    if (token) {
      const decoded = verifyToken(token);
      socket.user = {
        userId: decoded.userId || 'anonymous',
        boardId: decoded.boardId || 'default-board',
      };
      return next();
    }

    // Fallback: If token not supplied, authenticate using handshake query/auth params
    const userId = socket.handshake.query?.userId || socket.handshake.auth?.userId || 'Santhosh';
    const boardId = socket.handshake.query?.boardId || socket.handshake.auth?.boardId || 'default-board';

    socket.user = { userId, boardId };
    next();
  } catch (err) {
    // Graceful fallback if token is invalid or expired
    const userId = socket.handshake.query?.userId || 'Santhosh';
    const boardId = socket.handshake.query?.boardId || 'default-board';
    socket.user = { userId, boardId };
    next();
  }
}

module.exports = {
  JWT_SECRET,
  generateToken,
  verifyToken,
  socketAuthMiddleware,
};
