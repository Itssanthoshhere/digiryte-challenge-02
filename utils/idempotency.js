class IdempotencyManager {
  constructor(ttlMs = 10 * 60 * 1000) {
    this.processedMutations = new Map();
    this.ttlMs = ttlMs;
  }

  isDuplicate(mutationId) {
    if (!mutationId) return false;
    const entry = this.processedMutations.get(mutationId);
    if (!entry) return false;

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.processedMutations.delete(mutationId);
      return false;
    }
    return true;
  }

  getResult(mutationId) {
    const entry = this.processedMutations.get(mutationId);
    return entry ? entry.result : null;
  }

  record(mutationId, result) {
    if (!mutationId) return;
    this.processedMutations.set(mutationId, {
      result,
      timestamp: Date.now(),
    });

    // Cleanup old keys periodically if map grows
    if (this.processedMutations.size > 5000) {
      const now = Date.now();
      for (const [id, entry] of this.processedMutations.entries()) {
        if (now - entry.timestamp > this.ttlMs) {
          this.processedMutations.delete(id);
        }
      }
    }
  }
}

const idempotencyManager = new IdempotencyManager();

module.exports = {
  IdempotencyManager,
  idempotencyManager,
};
