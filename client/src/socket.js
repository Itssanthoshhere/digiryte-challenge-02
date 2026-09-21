import { io } from 'socket.io-client';

// userId persists across tabs (default to 'Santhosh')
const getUserId = () => {
  let id = localStorage.getItem('kanban-userId');
  if (!id) {
    id = 'Santhosh';
    localStorage.setItem('kanban-userId', id);
  }
  return id;
};

// boardId for multi-room scoping (default to 'default-board')
const getBoardId = () => {
  let id = localStorage.getItem('kanban-boardId');
  if (!id) {
    id = 'default-board';
    localStorage.setItem('kanban-boardId', id);
  }
  return id;
};

// deviceId is unique per browser tab
const getDeviceId = () => {
  let id = sessionStorage.getItem('kanban-tabId');
  if (!id) {
    id = 'tab-' + Math.random().toString(36).substring(2, 6);
    sessionStorage.setItem('kanban-tabId', id);
  }
  return id;
};

const deviceId = getDeviceId();
const userId = getUserId();
const boardId = getBoardId();

export const SERVER_OPTIONS = [
  { id: 'server-1', label: 'Server 1 (Port 3001)', url: 'http://localhost:3001' },
  { id: 'server-2', label: 'Server 2 (Port 3002)', url: 'http://localhost:3002' },
  { id: 'load-balancer', label: 'Load Balancer (Port 3000)', url: 'http://localhost:3000' },
];

const getDefaultServerUrl = () => {
  const savedUrl = localStorage.getItem('kanban-serverUrl');
  if (savedUrl) return savedUrl;

  if (import.meta.env.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL;
  }
  if (typeof window !== 'undefined') {
    if (window.location.port === '5173') {
      return 'http://localhost:3001';
    }
    return window.location.origin;
  }
  return 'http://localhost:3001';
};

const CURRENT_SERVER_URL = getDefaultServerUrl();

// Offline Mutation Queue & State Tracking
let lastSeenVersion = 0;
const offlineQueue = [];

// Helper to fetch or generate JWT auth token
const fetchAuthToken = async (targetUserId, targetBoardId) => {
  try {
    const res = await fetch(
      `${CURRENT_SERVER_URL}/api/auth/token?userId=${encodeURIComponent(
        targetUserId
      )}&boardId=${encodeURIComponent(targetBoardId)}`
    );
    if (res.ok) {
      const data = await res.json();
      return data.token;
    }
  } catch (err) {
    console.warn('[Socket] Failed to fetch JWT from server, falling back to mock client token:', err);
  }
  return null;
};

const socket = io(CURRENT_SERVER_URL, {
  transports: ['websocket'],
  autoConnect: false, // Async auth before connect
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

// Initialize socket connection with JWT Token
export const initSocket = async () => {
  const token = await fetchAuthToken(userId, boardId);
  socket.auth = { token };
  socket.connect();
};

// Socket Lifecycle Listeners for Reconnect & Offline Queueing
socket.on('connect', () => {
  console.log('[Socket] Connected with ID:', socket.id);
  // Request sync with lastSeenVersion for incremental recovery
  socket.emit('board:sync', { boardId, lastSeenVersion });

  // Flush pending offline mutation queue
  if (offlineQueue.length > 0) {
    console.log(`[Socket] Flushing ${offlineQueue.length} offline queued mutations`);
    while (offlineQueue.length > 0) {
      const item = offlineQueue.shift();
      socket.emit(item.eventName, item.payload, item.callback);
    }
  }
});

socket.on('request:sync', () => {
  socket.emit('board:sync', { boardId, lastSeenVersion });
});

// Safe Mutation Emitter with Offline Queueing & Idempotency Key
export const emitMutation = (eventName, payload, callback) => {
  const clientMutationId =
    payload.clientMutationId || `mut-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const enrichedPayload = {
    ...payload,
    boardId,
    clientMutationId,
  };

  if (!socket.connected) {
    console.log(`[Socket] Offline. Queueing mutation: ${eventName}`);
    offlineQueue.push({ eventName, payload: enrichedPayload, callback });
    return clientMutationId;
  }

  socket.emit(eventName, enrichedPayload, callback);
  return clientMutationId;
};

export const updateLastSeenVersion = (version) => {
  if (typeof version === 'number' && version > lastSeenVersion) {
    lastSeenVersion = version;
  }
};

export const updateUserId = (newUserId) => {
  const trimmed = newUserId.trim();
  const current = localStorage.getItem('kanban-userId');
  if (!trimmed || trimmed === current) return;
  localStorage.setItem('kanban-userId', trimmed);
  window.location.reload();
};

export const updateBoardId = (newBoardId) => {
  const trimmed = newBoardId.trim();
  const current = localStorage.getItem('kanban-boardId');
  if (!trimmed || trimmed === current) return;
  localStorage.setItem('kanban-boardId', trimmed);
  window.location.reload();
};

export const switchServer = (targetUrl) => {
  localStorage.setItem('kanban-serverUrl', targetUrl);
  window.location.reload();
};

export const simulateHardDisconnect = (durationMs = 2000) => {
  socket.disconnect();
  setTimeout(() => {
    socket.connect();
  }, durationMs);
};

// Auto-start socket initialization
initSocket();

export { socket, userId, boardId, deviceId, CURRENT_SERVER_URL, lastSeenVersion };
