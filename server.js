require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const Task = require('./models/Task');

const PORT = process.env.PORT || 3001;
const SERVER_ID = process.env.SERVER_ID || `server-${PORT}`;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/kanban-sync';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const app = express();
const server = http.createServer(app);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    serverId: SERVER_ID,
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

// API endpoint to check which server you're hitting
app.get('/api/server-info', (req, res) => {
  res.json({ serverId: SERVER_ID, port: PORT });
});

async function startServer() {
  // ── Connect to MongoDB ──
  try {
    await mongoose.connect(MONGODB_URI);
    console.log(`[${SERVER_ID}] Connected to MongoDB`);
  } catch (err) {
    console.error(`[${SERVER_ID}] MongoDB connection error:`, err.message);
    process.exit(1);
  }

  // ── Set up Socket.io with Redis adapter ──
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    // Allow both transports for flexibility, but client will prefer websocket
    transports: ['websocket', 'polling'],
  });

  try {
    const pubClient = createClient({ url: REDIS_URL });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => console.error(`[${SERVER_ID}] Redis pub error:`, err.message));
    subClient.on('error', (err) => console.error(`[${SERVER_ID}] Redis sub error:`, err.message));

    await Promise.all([pubClient.connect(), subClient.connect()]);
    console.log(`[${SERVER_ID}] Connected to Redis`);

    io.adapter(createAdapter(pubClient, subClient));
    console.log(`[${SERVER_ID}] Redis adapter attached`);
  } catch (err) {
    console.error(`[${SERVER_ID}] Redis connection error:`, err.message);
    console.warn(`[${SERVER_ID}] Running WITHOUT Redis adapter (single-instance mode)`);
  }

  // ── Socket.io connection handling ──
  io.on('connection', async (socket) => {
    const userId = socket.handshake.query.userId;
    const deviceId = socket.handshake.query.deviceId;

    console.log(`[${SERVER_ID}] Client connected: userId=${userId}, deviceId=${deviceId}, socketId=${socket.id}`);

    // Join user-specific room (for multi-device sync)
    if (userId) {
      socket.join(`user:${userId}`);
    }

    // Send server info so client knows which instance it's on
    socket.emit('server:info', { serverId: SERVER_ID, port: PORT });

    // ── Send full state on connect/reconnect (from MongoDB, not memory) ──
    try {
      const tasks = await Task.find().sort({ column: 1, order: 1, createdAt: 1 });
      socket.emit('state:sync', tasks);
    } catch (err) {
      console.error(`[${SERVER_ID}] Error fetching tasks:`, err.message);
      socket.emit('state:sync', []);
    }

    // ── Task: Create ──
    socket.on('task:create', async (data, callback) => {
      try {
        const taskCount = await Task.countDocuments({ column: 'todo' });
        const task = new Task({
          title: data.title,
          column: 'todo',
          order: taskCount,
          createdBy: userId || 'anonymous',
        });
        await task.save();
        console.log(`[${SERVER_ID}] Task created: ${task._id} - "${task.title}"`);

        // Broadcast to ALL clients (across all server instances via Redis adapter)
        io.emit('task:created', task);

        if (callback) callback({ success: true, task });
      } catch (err) {
        console.error(`[${SERVER_ID}] Error creating task:`, err.message);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // ── Task: Move (change column) ──
    socket.on('task:move', async (data, callback) => {
      try {
        const task = await Task.findByIdAndUpdate(
          data.taskId,
          { column: data.toColumn, order: data.order || 0 },
          { new: true }
        );

        if (!task) {
          if (callback) callback({ success: false, error: 'Task not found' });
          return;
        }

        console.log(`[${SERVER_ID}] Task moved: ${task._id} -> ${data.toColumn}`);

        // Broadcast to ALL clients
        io.emit('task:moved', task);

        if (callback) callback({ success: true, task });
      } catch (err) {
        console.error(`[${SERVER_ID}] Error moving task:`, err.message);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // ── Task: Delete ──
    socket.on('task:delete', async (data, callback) => {
      try {
        const task = await Task.findByIdAndDelete(data.taskId);

        if (!task) {
          if (callback) callback({ success: false, error: 'Task not found' });
          return;
        }

        console.log(`[${SERVER_ID}] Task deleted: ${task._id}`);

        // Broadcast to ALL clients
        io.emit('task:deleted', { taskId: data.taskId });

        if (callback) callback({ success: true });
      } catch (err) {
        console.error(`[${SERVER_ID}] Error deleting task:`, err.message);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // ── Disconnect ──
    socket.on('disconnect', (reason) => {
      console.log(`[${SERVER_ID}] Client disconnected: userId=${userId}, deviceId=${deviceId}, reason=${reason}`);
    });
  });

  // ── Start listening ──
  server.listen(PORT, () => {
    console.log(`[${SERVER_ID}] Server running on port ${PORT}`);
    console.log(`[${SERVER_ID}] MongoDB: ${MONGODB_URI}`);
    console.log(`[${SERVER_ID}] Redis: ${REDIS_URL}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
