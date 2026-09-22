require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const cors = require('cors');

let generateKeyBetween;

const Task = require('./models/Task');
const BoardEvent = require('./models/BoardEvent');
const {
  generateToken,
  verifyToken,
  socketAuthMiddleware,
} = require('./middleware/socketAuth');
const {
  taskCreateSchema,
  taskMoveSchema,
  taskDeleteSchema,
  validatePayload,
} = require('./utils/validation');
const { defaultLimiter } = require('./utils/rateLimiter');
const { idempotencyManager } = require('./utils/idempotency');

const PORT = process.env.PORT || 3001;
const SERVER_ID = process.env.SERVER_ID || `server-${PORT}`;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/kanban-sync';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_STRICT = process.env.REDIS_STRICT === 'true';

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Serve static React build files
const clientDistPath = path.join(__dirname, 'client', 'dist');
app.use(express.static(clientDistPath));

let redisConnected = false;
let pubClient = null;
let subClient = null;

// Track active board presence in memory (mirrored in Redis when available)
const presenceMap = new Map(); // boardId -> Map(socketId -> userId)

function updateBoardPresence(boardId, socketId, userId, isRemove = false) {
  if (!presenceMap.has(boardId)) {
    presenceMap.set(boardId, new Map());
  }
  const boardPresence = presenceMap.get(boardId);
  if (isRemove) {
    boardPresence.delete(socketId);
  } else {
    boardPresence.set(socketId, userId);
  }
  const activeUsers = Array.from(new Set(boardPresence.values()));
  return activeUsers;
}

// ── Auth Token Generator Endpoint ──
app.get('/api/auth/token', (req, res) => {
  const userId = req.query.userId || 'Santhosh';
  const boardId = req.query.boardId || 'default-board';
  const token = generateToken({ userId, boardId });
  res.json({ token, userId, boardId });
});

// ── Health Check Endpoint (Fails Fast / Reports Unhealthy if Redis/Mongo Down) ──
app.get('/health', (req, res) => {
  const mongoConnected = mongoose.connection.readyState === 1;
  const isHealthy = mongoConnected && redisConnected;
  const status = isHealthy ? 'ok' : mongoConnected ? 'degraded' : 'unhealthy';

  const healthData = {
    status,
    serverId: SERVER_ID,
    port: PORT,
    mongoConnected,
    redisConnected,
    timestamp: new Date().toISOString(),
  };

  if (!isHealthy && REDIS_STRICT) {
    return res.status(503).json(healthData);
  }
  res.status(isHealthy ? 200 : 503).json(healthData);
});

// ── Metrics Endpoint ──
app.get('/metrics', (req, res) => {
  res.json({
    serverId: SERVER_ID,
    port: PORT,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    mongoState: mongoose.connection.readyState,
    redisConnected,
    activeBoards: presenceMap.size,
    timestamp: new Date().toISOString(),
  });
});

// ── API endpoint to check server info ──
app.get('/api/server-info', (req, res) => {
  res.json({ serverId: SERVER_ID, port: PORT, redisConnected });
});

// Increment Board Event Version and Log Event
async function recordBoardEvent(boardId, eventType, payload) {
  // Find highest version for this board
  const lastEvent = await BoardEvent.findOne({ boardId }).sort({ version: -1 });
  const nextVersion = lastEvent ? lastEvent.version + 1 : 1;

  const eventLog = new BoardEvent({
    boardId,
    version: nextVersion,
    eventType,
    payload: { ...payload, boardVersion: nextVersion },
  });
  await eventLog.save();
  return nextVersion;
}

async function startServer() {
  // ── Load ES Modules dynamically ──
  const fi = await import('fractional-indexing');
  generateKeyBetween = fi.generateKeyBetween;

  // ── Connect to MongoDB ──
  try {
    await mongoose.connect(MONGODB_URI);
    console.log(`[${SERVER_ID}] Connected to MongoDB`);
  } catch (err) {
    console.error(`[${SERVER_ID}] MongoDB connection error:`, err.message);
    process.exit(1);
  }

  // ── Set up Socket.io ──
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes recovery buffer
      skipMiddlewares: false,
    },
  });

  // ── Set up Redis Adapter ──
  try {
    const redisConfig = {
      url: REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            return new Error('Redis not reachable');
          }
          return 500;
        },
      },
    };

    pubClient = createClient(redisConfig);
    subClient = pubClient.duplicate();

    const onPubError = (err) =>
      console.warn(`[${SERVER_ID}] Redis connect attempt error: ${err.message}`);
    pubClient.on('error', onPubError);
    subClient.on('error', onPubError);

    await Promise.all([pubClient.connect(), subClient.connect()]);

    pubClient.off('error', onPubError);
    subClient.off('error', onPubError);

    pubClient.on('error', (err) => {
      console.error(`[${SERVER_ID}] Redis pub error:`, err.message);
      redisConnected = false;
    });
    subClient.on('error', (err) => {
      console.error(`[${SERVER_ID}] Redis sub error:`, err.message);
      redisConnected = false;
    });

    io.adapter(createAdapter(pubClient, subClient));
    redisConnected = true;
    console.log(`[${SERVER_ID}] Connected to Redis at ${REDIS_URL} (Adapter active)`);
  } catch (err) {
    redisConnected = false;
    console.warn(
      `\n[${SERVER_ID}] ⚠️ Could not connect to Redis at ${REDIS_URL}: ${
        err.message || 'Connection refused'
      }`
    );
    if (REDIS_STRICT) {
      console.error(`[${SERVER_ID}] REDIS_STRICT is enabled. Exiting fast due to Redis failure.`);
      process.exit(1);
    }
  }

  // ── Attach JWT Socket Authentication Middleware ──
  io.use(socketAuthMiddleware);

  // ── Socket.io Connection & Event Handling ──
  io.on('connection', async (socket) => {
    const { userId, boardId } = socket.user;
    const roomName = `board:${boardId}`;

    console.log(
      `[${SERVER_ID}] Client connected: userId=${userId}, boardId=${boardId}, socketId=${socket.id}`
    );

    // Join room scoped to board
    socket.join(roomName);

    // Track presence
    const activeUsers = updateBoardPresence(boardId, socket.id, userId, false);
    io.to(roomName).emit('presence:update', { boardId, activeUsers });

    // Send server info
    socket.emit('server:info', { serverId: SERVER_ID, port: PORT, redisConnected });

    // ── Board State Request / Delta Recovery ──
    socket.on('board:sync', async (data = {}) => {
      try {
        const targetBoard = data.boardId || boardId;
        const lastSeenVersion = data.lastSeenVersion;

        // If client provided lastSeenVersion, attempt incremental delta sync
        if (typeof lastSeenVersion === 'number' && lastSeenVersion > 0) {
          const missedEvents = await BoardEvent.find({
            boardId: targetBoard,
            version: { $gt: lastSeenVersion },
          }).sort({ version: 1 });

          if (missedEvents.length > 0 && missedEvents.length < 100) {
            console.log(
              `[${SERVER_ID}] Sending ${missedEvents.length} delta events to socket ${socket.id}`
            );
            socket.emit('state:delta', {
              events: missedEvents.map((e) => ({
                eventType: e.eventType,
                payload: e.payload,
                version: e.version,
              })),
            });
            return;
          }
        }

        // Full fetch if no lastSeenVersion or delta gap too large
        const tasks = await Task.find({ boardId: targetBoard }).sort({ order: 1, createdAt: 1 });
        const latestEvent = await BoardEvent.findOne({ boardId: targetBoard }).sort({ version: -1 });
        const currentVersion = latestEvent ? latestEvent.version : 0;

        socket.emit('state:sync', { tasks, boardVersion: currentVersion });
      } catch (err) {
        console.error(`[${SERVER_ID}] Error syncing board state:`, err.message);
        socket.emit('state:sync', { tasks: [], boardVersion: 0 });
      }
    });

    // Automatically send initial sync on connection
    socket.emit('request:sync');

    // ── Task: Create ──
    socket.on('task:create', async (rawPayload, callback) => {
      // 1. Rate limiting check
      if (!defaultLimiter.isAllowed(socket.id)) {
        if (callback)
          callback({
            success: false,
            error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded. Please wait.' },
          });
        return;
      }

      // 2. Payload Validation with Zod
      const validation = validatePayload(taskCreateSchema, rawPayload || {});
      if (!validation.valid) {
        if (callback)
          callback({
            success: false,
            error: { code: 'INVALID_PAYLOAD', message: validation.error },
          });
        return;
      }

      const { title, clientMutationId } = validation.data;
      const targetBoard = validation.data.boardId || boardId;

      // 3. Idempotency check for client retry
      if (clientMutationId && idempotencyManager.isDuplicate(clientMutationId)) {
        const cachedResult = idempotencyManager.getResult(clientMutationId);
        if (callback) callback(cachedResult);
        return;
      }

      try {
        // Compute fractional order key relative to existing tasks in 'todo' column
        const lastTodoTask = await Task.findOne({ boardId: targetBoard, column: 'todo' }).sort({
          order: -1,
        });
        const lastOrderKey = lastTodoTask ? lastTodoTask.order : null;
        const newOrderKey = generateKeyBetween(lastOrderKey, null);

        const task = new Task({
          boardId: targetBoard,
          title,
          column: 'todo',
          order: newOrderKey,
          version: 1,
          createdBy: userId,
        });

        await task.save();

        // Increment board sequence event log
        const boardVersion = await recordBoardEvent(targetBoard, 'task:created', { task });

        console.log(`[${SERVER_ID}] Task created in ${targetBoard}: ${task._id} - "${task.title}"`);

        // Broadcast scoped ONLY to users in this board room
        const eventData = { task, boardVersion, clientMutationId };
        io.to(`board:${targetBoard}`).emit('task:created', eventData);

        const result = { success: true, task, boardVersion, clientMutationId };
        idempotencyManager.record(clientMutationId, result);
        if (callback) callback(result);
      } catch (err) {
        console.error(`[${SERVER_ID}] Error creating task:`, err.message);
        if (callback)
          callback({
            success: false,
            error: { code: 'SERVER_ERROR', message: err.message },
          });
      }
    });

    // ── Task: Move / Change Column & Reorder ──
    socket.on('task:move', async (rawPayload, callback) => {
      if (!defaultLimiter.isAllowed(socket.id)) {
        if (callback)
          callback({
            success: false,
            error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded. Please wait.' },
          });
        return;
      }

      const validation = validatePayload(taskMoveSchema, rawPayload || {});
      if (!validation.valid) {
        if (callback)
          callback({
            success: false,
            error: { code: 'INVALID_PAYLOAD', message: validation.error },
          });
        return;
      }

      const { taskId, toColumn, expectedVersion, clientMutationId, order: requestedOrder } = validation.data;
      const targetBoard = validation.data.boardId || boardId;

      if (clientMutationId && idempotencyManager.isDuplicate(clientMutationId)) {
        const cachedResult = idempotencyManager.getResult(clientMutationId);
        if (callback) callback(cachedResult);
        return;
      }

      try {
        const existingTask = await Task.findOne({ _id: taskId, boardId: targetBoard });
        if (!existingTask) {
          if (callback)
            callback({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Task not found' },
            });
          return;
        }

        // Optimistic concurrency version check
        if (typeof expectedVersion === 'number' && existingTask.version !== expectedVersion) {
          if (callback) {
            callback({
              success: false,
              error: {
                code: 'CONCURRENCY_CONFLICT',
                message: 'Task was updated by another user. Refreshing state.',
                currentTask: existingTask,
              },
            });
          }
          return;
        }

        // Fractional indexing calculation if requestedOrder is not supplied
        let newOrder = typeof requestedOrder === 'string' ? requestedOrder : existingTask.order;
        if (!requestedOrder || typeof requestedOrder !== 'string') {
          const lastInCol = await Task.findOne({
            boardId: targetBoard,
            column: toColumn,
            _id: { $ne: taskId },
          }).sort({ order: -1 });
          newOrder = generateKeyBetween(lastInCol ? lastInCol.order : null, null);
        }

        // findByIdAndUpdate with runValidators: true
        const updatedTask = await Task.findByIdAndUpdate(
          taskId,
          {
            column: toColumn,
            order: newOrder,
            $inc: { version: 1 },
          },
          { new: true, runValidators: true }
        );

        const boardVersion = await recordBoardEvent(targetBoard, 'task:moved', { task: updatedTask });

        console.log(`[${SERVER_ID}] Task moved in ${targetBoard}: ${taskId} -> ${toColumn} (v${updatedTask.version})`);

        const eventData = { task: updatedTask, boardVersion, clientMutationId };
        io.to(`board:${targetBoard}`).emit('task:moved', eventData);

        const result = { success: true, task: updatedTask, boardVersion, clientMutationId };
        idempotencyManager.record(clientMutationId, result);
        if (callback) callback(result);
      } catch (err) {
        console.error(`[${SERVER_ID}] Error moving task:`, err.message);
        if (callback)
          callback({
            success: false,
            error: { code: 'SERVER_ERROR', message: err.message },
          });
      }
    });

    // ── Task: Delete ──
    socket.on('task:delete', async (rawPayload, callback) => {
      if (!defaultLimiter.isAllowed(socket.id)) {
        if (callback)
          callback({
            success: false,
            error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded. Please wait.' },
          });
        return;
      }

      const validation = validatePayload(taskDeleteSchema, rawPayload || {});
      if (!validation.valid) {
        if (callback)
          callback({
            success: false,
            error: { code: 'INVALID_PAYLOAD', message: validation.error },
          });
        return;
      }

      const { taskId, expectedVersion, clientMutationId } = validation.data;
      const targetBoard = validation.data.boardId || boardId;

      if (clientMutationId && idempotencyManager.isDuplicate(clientMutationId)) {
        const cachedResult = idempotencyManager.getResult(clientMutationId);
        if (callback) callback(cachedResult);
        return;
      }

      try {
        const existingTask = await Task.findOne({ _id: taskId, boardId: targetBoard });
        if (!existingTask) {
          if (callback)
            callback({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Task not found' },
            });
          return;
        }

        if (typeof expectedVersion === 'number' && existingTask.version !== expectedVersion) {
          if (callback) {
            callback({
              success: false,
              error: {
                code: 'CONCURRENCY_CONFLICT',
                message: 'Task was updated by another user before deletion.',
              },
            });
          }
          return;
        }

        await Task.findByIdAndDelete(taskId);

        const boardVersion = await recordBoardEvent(targetBoard, 'task:deleted', { taskId });

        console.log(`[${SERVER_ID}] Task deleted in ${targetBoard}: ${taskId}`);

        const eventData = { taskId, boardVersion, clientMutationId };
        io.to(`board:${targetBoard}`).emit('task:deleted', eventData);

        const result = { success: true, taskId, boardVersion, clientMutationId };
        idempotencyManager.record(clientMutationId, result);
        if (callback) callback(result);
      } catch (err) {
        console.error(`[${SERVER_ID}] Error deleting task:`, err.message);
        if (callback)
          callback({
            success: false,
            error: { code: 'SERVER_ERROR', message: err.message },
          });
      }
    });

    // ── Disconnect ──
    socket.on('disconnect', (reason) => {
      console.log(
        `[${SERVER_ID}] Client disconnected: userId=${userId}, boardId=${boardId}, socketId=${socket.id}, reason=${reason}`
      );
      defaultLimiter.cleanup(socket.id);
      const activeUsers = updateBoardPresence(boardId, socket.id, userId, true);
      io.to(roomName).emit('presence:update', { boardId, activeUsers });
    });
  });

  // SPA fallback
  app.get('*', (req, res) => {
    const indexPath = path.join(clientDistPath, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        res.status(200).send('Kanban Sync API Server Running');
      }
    });
  });

  // ── Start listening ──
  server.listen(PORT, () => {
    console.log(`[${SERVER_ID}] Enterprise Kanban Sync Server running on port ${PORT}`);
    console.log(`[${SERVER_ID}] MongoDB: ${MONGODB_URI}`);
    console.log(`[${SERVER_ID}] Redis: ${REDIS_URL} (Strict: ${REDIS_STRICT})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
