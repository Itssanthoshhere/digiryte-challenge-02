# Distributed Real-Time Sync — Collaborative Kanban Board

> **Digiryte UK — Technical Challenge (Round 3 Assessment)**
> **Candidate:** Santhosh VS
> **Challenge:** Challenge 2 — Distributed Real-Time Sync

A distributed, real-time collaborative Kanban board built with **Node.js, Express, Socket.io, Redis Pub/Sub, MongoDB, and React (Tailwind CSS)**. The system runs across multiple server instances with state shared in real time through a Redis pub/sub adapter, central persistence in MongoDB, automatic reconnection on hard disconnects, and full state recovery across different server nodes.

---

## Architecture

```
                 ┌──────────────────────────────────────────────┐
                 │       Browser Clients (Tabs / Devices)       │
                 │   (userId in localStorage, tabId in session) │
                 └──────────────────────┬───────────────────────┘
                                        │
                         WebSocket (ws://) connection
                                        │
                                        ▼
                 ┌──────────────────────────────────────────────┐
                 │       Load Balancer (Port 3000)              │
                 │  Node.js http-proxy — round-robin + WS proxy │
                 └──────────────┬───────────────────────────────┘
                                │
                   ┌────────────┴────────────┐
                   ▼                         ▼
    ┌─────────────────────┐     ┌─────────────────────┐
    │  Server Instance 1  │     │  Server Instance 2  │
    │     (Port 3001)     │     │     (Port 3002)     │
    │   ID: "server-1"    │     │   ID: "server-2"    │
    └──────────┬──────────┘     └──────────┬──────────┘
               │                           │
               │  @socket.io/redis-adapter │
               │  (pub/sub across nodes)   │
               └────────────┬──────────────┘
                            ▼
                 ┌──────────────────────────────────────────────┐
                 │              Redis Pub/Sub Layer             │
                 │   Broadcasts events to all connected nodes   │
                 └──────────────────────┬───────────────────────┘
                                        ▼
                 ┌──────────────────────────────────────────────┐
                 │           MongoDB (Atlas or local)           │
                 │   Single source of truth — all task state    │
                 └──────────────────────────────────────────────┘
```

---

## How Each Requirement Is Met

| Requirement | Implementation |
|---|---|
| **Multiple server instances** | `npm run server1` (port 3001) and `npm run server2` (port 3002) run as fully independent Node.js processes. |
| **Redis pub/sub adapter** | `@socket.io/redis-adapter` with separate `pubClient` / `subClient`. An event from a client on Server 1 travels through Redis and is instantly received by clients on Server 2. |
| **MongoDB persistence** | All task mutations (`task:create`, `task:move`, `task:delete`) are saved to MongoDB **before** broadcasting. Neither server holds state in memory — MongoDB is the single source of truth. |
| **Hard disconnect + auto-reconnect** | Socket.io client uses `reconnection: true, reconnectionAttempts: Infinity`. A **"Simulate Disconnect"** button in the UI calls `socket.disconnect()` then `socket.connect()` after 2 seconds. |
| **State recovery on different instance** | On every connect/reconnect, the server runs `Task.find()` from MongoDB and emits `state:sync` to the client. Switching from Server 1 to Server 2 gives the full board state immediately. |
| **Multi-device / multi-tab consistency** | `userId` is stored in `localStorage` (shared across all same-origin tabs). Each tab gets a unique `tabId` in `sessionStorage`. Both are sent in the socket handshake query. |
| **Load balancer / instance switching** | `load-balancer.js` proxies HTTP and WebSocket traffic round-robin across both instances. The in-app **Target** dropdown lets you switch instances manually without restarting anything. |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| HTTP server | Express 4 |
| Real-time | Socket.io 4.x |
| Cross-instance sync | `@socket.io/redis-adapter` + Redis 8.x |
| Database | MongoDB via Mongoose (Atlas or local) |
| Load balancer | Node.js `http-proxy` (WebSocket-aware) |
| Frontend | React 19, Vite, Tailwind CSS v4 |
| Font | Outfit (Google Fonts) |

---

## Project Structure

```
digiryte-challenge-02/
├── server.js              # Express + Socket.io server (runs as multiple instances)
├── load-balancer.js       # HTTP/WS round-robin proxy across server instances
├── models/
│   └── Task.js            # Mongoose schema: title, column, order, createdBy, timestamps
├── client/
│   ├── index.html         # Vite entry — Outfit font, Digiryte favicon
│   ├── vite.config.js     # Vite + React + Tailwind CSS v4 plugin
│   ├── public/
│   │   └── logo.svg       # Digiryte logo (favicon + header)
│   └── src/
│       ├── main.jsx       # React root
│       ├── App.jsx        # Socket event handling, task state, board layout
│       ├── index.css      # Tailwind import + CSS custom properties
│       ├── socket.js      # Socket.io client, userId/tabId identity, helpers
│       └── components/
│           ├── StatusBar.jsx  # Connection status, server info, target switcher, name editor
│           ├── Column.jsx     # Kanban column with drag-and-drop
│           └── TaskCard.jsx   # Task card with move buttons and delete
├── .env.example           # Environment variable template
├── package.json           # Scripts + backend dependencies
└── README.md
```

---

## Prerequisites

- **Node.js** v18+
- **MongoDB** — local (`mongodb://localhost:27017`) or [MongoDB Atlas](https://www.mongodb.com/atlas) (free tier)
- **Redis** — local (`redis://localhost:6379`) or [Upstash Redis](https://upstash.com) (free tier)

Install Redis locally on macOS:
```bash
brew install redis && brew services start redis
```

---

## Quick Start

### 1. Install Dependencies

```bash
# Backend
npm install

# Frontend
cd client && npm install && cd ..
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3001
SERVER_ID=server-1
MONGODB_URI=mongodb://localhost:27017/kanban-sync
REDIS_URL=redis://localhost:6379
```

> Use your MongoDB Atlas URI and/or an Upstash Redis URL if running without local services.

### 3. Build the Frontend

```bash
npm run build
```

### 4. Start the Cluster

Open three separate terminals:

```bash
# Terminal 1 — Server Instance 1
npm run server1

# Terminal 2 — Server Instance 2
npm run server2

# Terminal 3 — Load Balancer
npm run lb
```

Open **http://localhost:3000** in your browser.

> **Dev mode** (with hot reload): `npm run client:dev` — Vite runs on port 5173 and defaults to connecting to `http://localhost:3001`.

---

## Verification Tests

### Test 1 — Cross-Instance Real-Time Sync
1. Open **Tab A** at `http://localhost:3001` — status bar shows `Node: server-1`.
2. Open **Tab B** at `http://localhost:3002` — status bar shows `Node: server-2`.
3. Add a task in Tab A.
4. **Expected:** Task appears instantly in Tab B — bridged via Redis Pub/Sub across separate processes.
5. Move the task to "In Progress" from Tab B.
6. **Expected:** Tab A updates immediately.

### Test 2 — State Recovery on a Different Instance
1. Connect to `http://localhost:3001` and add several tasks.
2. Use the **Target** dropdown in the status bar to switch to `Server 2 (Port 3002)`.
3. The page reloads; the client connects to Server 2.
4. **Expected:** Full board state is recovered from MongoDB via `state:sync` — no data loss.

### Test 3 — Hard Disconnect & Auto-Reconnect
1. Click **"Simulate Disconnect"** in the status bar.
2. Status changes to "Disconnected" and the reconnection overlay appears.
3. After ~2 seconds the socket reconnects automatically.
4. **Expected:** Status turns green ("Connected") and the board is re-synced from MongoDB.
5. **Alternative:** Kill `npm run server1` (`Ctrl+C`). Clients on the load balancer detect the drop and reconnect automatically.

### Test 4 — Multi-Tab / Multi-Device Consistency
1. Open two browser tabs both at `http://localhost:3000`.
2. Status bar shows:
   - `User: Santhosh` — same across both tabs (from `localStorage`)
   - `Tab: tab-xxxx` — different in each tab (from `sessionStorage`)
3. Create or delete a task in one tab.
4. **Expected:** The other tab updates instantly — same user room, different socket connections.

### Test 5 — Custom User Name
1. Click the **✎** pencil icon next to the user name in the status bar.
2. Type a new name and press Enter (or click away).
3. **Expected:** The page reloads, the new name is saved to `localStorage`, and all future tasks show that name as the author.

---

## NPM Scripts

| Script | Command | Description |
|---|---|---|
| `npm run server1` | `PORT=3001 SERVER_ID=server-1 node server.js` | Start Server Instance 1 |
| `npm run server2` | `PORT=3002 SERVER_ID=server-2 node server.js` | Start Server Instance 2 |
| `npm run lb` | `node load-balancer.js` | Start the WebSocket-aware load balancer on port 3000 |
| `npm run build` | `npm --prefix client run build` | Build React + Tailwind production bundle into `client/dist/` |
| `npm run client:dev` | `npm --prefix client run dev` | Start Vite dev server on port 5173 with HMR |
| `npm start` | `node server.js` | Start a single server instance (uses `.env` for PORT/SERVER_ID) |

---

## Key Design Decisions

1. **WebSocket-only transport.** The Socket.io client uses `transports: ['websocket']`, which avoids HTTP long-polling. This eliminates the need for sticky sessions when distributing across multiple instances — WebSocket connections are stateless at the load balancer level.

2. **MongoDB as the source of truth, not in-memory state.** Every mutation is persisted to MongoDB *before* being broadcast via Redis. On any reconnect, the server runs a fresh `Task.find()` — state is always consistent even if a server process restarts mid-session.

3. **Identity model: `userId` (persistent) + `tabId` (per-tab).** `userId` in `localStorage` identifies a user across all their tabs and windows on the same browser. `tabId` in `sessionStorage` is unique per tab and is cleared when the tab closes. Both are sent in the socket handshake query so the server can join the correct `user:{userId}` room.

4. **Graceful Redis fallback.** If Redis is not reachable at startup, the server logs a clear warning and continues running. A single-instance deployment still works fully; cross-instance sync is simply not available.
