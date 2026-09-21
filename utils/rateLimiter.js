class SocketRateLimiter {
  constructor(windowMs = 5000, maxEvents = 20) {
    this.windowMs = windowMs;
    this.maxEvents = maxEvents;
    this.timestamps = new Map();
  }

  isAllowed(socketId) {
    const now = Date.now();
    let socketTimestamps = this.timestamps.get(socketId) || [];

    // Filter out timestamps older than windowMs
    socketTimestamps = socketTimestamps.filter((ts) => now - ts < this.windowMs);

    if (socketTimestamps.length >= this.maxEvents) {
      return false;
    }

    socketTimestamps.push(now);
    this.timestamps.set(socketId, socketTimestamps);
    return true;
  }

  cleanup(socketId) {
    this.timestamps.delete(socketId);
  }
}

const defaultLimiter = new SocketRateLimiter();

module.exports = {
  SocketRateLimiter,
  defaultLimiter,
};
