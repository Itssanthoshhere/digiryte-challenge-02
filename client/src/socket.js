import { io } from 'socket.io-client';

// userId persists across tabs (same user), deviceId is unique per tab
const getUserId = () => {
  let id = localStorage.getItem('kanban-userId');
  if (!id) {
    id = 'user-' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('kanban-userId', id);
  }
  return id;
};

const deviceId = 'device-' + Math.random().toString(36).substring(2, 9);
const userId = getUserId();

// Dynamic server URL:
// - If VITE_SERVER_URL is provided, use that
// - If running inside Vite dev server (port 5173), default to server on 3001
// - If running through Nginx load balancer or Express directly, use window.location.origin
const getDefaultServerUrl = () => {
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

const SERVER_URL = getDefaultServerUrl();

const socket = io(SERVER_URL, {
  transports: ['websocket'], // WebSocket only — no sticky sessions needed
  query: { userId, deviceId },
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

export { socket, userId, deviceId };
