const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    boardId: {
      type: String,
      required: true,
      default: 'default-board',
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    column: {
      type: String,
      required: true,
      enum: ['todo', 'in-progress', 'done'],
      default: 'todo',
    },
    order: {
      type: String,
      required: true,
      default: 'a0',
    },
    version: {
      type: Number,
      default: 1,
    },
    createdBy: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Task', taskSchema);
