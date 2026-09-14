import { io } from 'socket.io-client';

// userId persists across tabs (default to 'Santhosh', customizable by user)
const getUserId = () => {
  let id = localStorage.getItem('kanban-userId');
  if (!id) {
    id = 'Santhosh';
    localStorage.setItem('kanban-userId', id);
  }
  return id;
};

// deviceId is unique per browser tab (sessionStorage — cleared when tab closes)
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

// Dynamic server URL:
// - If VITE_SERVER_URL is provided, use that
// - If running inside Vite dev server (port 5173), default to server on 3001
// - If running through Nginx load balancer or Express directly, use window.location.origin
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

const socket = io(CURRENT_SERVER_URL, {
  transports: ['websocket'], // WebSocket only — no sticky sessions needed
  query: { userId, deviceId },
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

export const updateUserId = (newUserId) => {
  const trimmed = newUserId.trim();
  const current = localStorage.getItem('kanban-userId');
  if (!trimmed || trimmed === current) return;
  localStorage.setItem('kanban-userId', trimmed);
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

export { socket, userId, deviceId, CURRENT_SERVER_URL };
