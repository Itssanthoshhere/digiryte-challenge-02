const mongoose = require('mongoose');

const boardEventSchema = new mongoose.Schema(
  {
    boardId: {
      type: String,
      required: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
    },
    eventType: {
      type: String,
      required: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Composite index for fast delta fetching by board & version range
boardEventSchema.index({ boardId: 1, version: 1 });

module.exports = mongoose.model('BoardEvent', boardEventSchema);
