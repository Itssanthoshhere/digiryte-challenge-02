# Challenge 2 — Distributed Real-Time Sync

Build a real-time collaborative feature (shared kanban board) where multiple clients share live state, synced across multiple server instances via Redis pub/sub, persisted in MongoDB.

## Proposed Architecture

```
┌──────────┐     ┌──────────────┐     ┌──────────┐     ┌──────────┐
│  Client   │────▶│   Nginx LB   │────▶│ Server 1 │────▶│  Redis   │
│ (Browser) │◀────│  (port 80)   │◀────│ :3001    │◀────│ Pub/Sub  │
└──────────┘     └──────────────┘     ├──────────┤     └──────────┘
                                      │ Server 2 │────▶│  MongoDB  │
                                      │ :3002    │     └──────────┘
                                      └──────────┘
```

### What We're Building
A **collaborative task board** — a simplified Kanban board where users can:
- Add, move, and delete task cards
- See changes in real-time from any tab/device
- Stay synced even after disconnect/reconnect to a different server

### Why a Task Board?
It's simple enough to build in 3-4 hours, demonstrates all required features (real-time sync, multi-device, state recovery), and is easy to visually verify.

---

## Proposed Changes

### 1. Project Setup

#### [NEW] `package.json`
Node.js project with dependencies:
- `express`, `socket.io`, `@socket.io/redis-adapter`
- `redis`, `mongoose`, `cors`, `dotenv`

#### [NEW] `.env.example`
Environment variables for Redis URL, MongoDB URL, server ports.

#### [NEW] `.gitignore`
Standard Node.js gitignore.

---

### 2. Server (Backend)

#### [NEW] `server.js`
- Express + Socket.io server
- Takes `PORT` from env/CLI arg so we can run 2 instances on different ports
- Redis adapter for cross-instance event broadcasting
- MongoDB (Mongoose) for state persistence
- Socket.io event handlers:
  - `task:create` — add a new task, save to DB, broadcast
  - `task:move` — move task between columns, update DB, broadcast
  - `task:delete` — delete task, update DB, broadcast
  - `state:sync` — on connect/reconnect, fetch full state from MongoDB and send to client
- Reconnection handling: on `connection`, send current state from MongoDB (not from local memory)
- User/device tracking: each socket gets a `userId` + `deviceId` — server joins them to a user room so all their tabs get updates

#### [NEW] `models/Task.js`
Mongoose schema:
```
{ title, column, order, createdBy, createdAt, updatedAt }
```

---

### 3. Load Balancer

#### [NEW] `nginx.conf`
- Simple Nginx config
- Upstream with 2 server instances (localhost:3001, localhost:3002)
- WebSocket upgrade headers
- Round-robin (no sticky sessions needed if we use WebSocket-only transport)

---

### 4. Client (Frontend)

#### [NEW] `public/index.html`
Single-page app with:
- 3-column Kanban layout (To Do, In Progress, Done)
- Task cards with drag-and-drop
- "Add task" form
- Connection status indicator (connected/disconnected/reconnecting)
- Shows which server instance the client is connected to

#### [NEW] `public/styles.css`
Clean, modern styling for the board.

#### [NEW] `public/app.js`
- Socket.io client with:
  - `transports: ['websocket']` (WebSocket only, no polling — avoids sticky session requirement)
  - Auto-reconnect enabled (default in socket.io)
  - On connect: request full state from server
  - On disconnect: show status indicator
  - On reconnect: re-fetch full state from MongoDB via server
- `userId` generated on first load, stored in `localStorage` (persists across tabs)
- `deviceId` generated per tab (unique per tab via `sessionStorage` or random)
- Drag-and-drop to move tasks between columns
- Real-time UI updates from socket events

---

### 5. Docker Compose (for easy local setup)

#### [NEW] `docker-compose.yml`
- Redis service
- MongoDB service  
- Server instance 1 (port 3001)
- Server instance 2 (port 3002)
- Nginx load balancer (port 80)

#### [NEW] `Dockerfile`
Simple Node.js Dockerfile for the server.

---

### 6. Documentation

#### [NEW] `README.md`
- Project overview
- Architecture diagram
- How to run (Docker Compose + manual)
- How to test each requirement
- Assumptions made

---

## Commit Strategy

1. `init: project setup with package.json and gitignore`
2. `feat: add MongoDB Task model`
3. `feat: add server with Socket.io and Redis adapter`
4. `feat: add client UI with kanban board`
5. `feat: add auto-reconnect and state recovery`
6. `feat: add multi-device/tab support`
7. `infra: add nginx config and docker-compose`
8. `docs: add README with setup instructions`

---

## Verification Plan

### Manual Testing
1. Start Redis + MongoDB + 2 server instances + Nginx
2. Open 2 browser tabs — verify both see same tasks
3. Add/move/delete tasks — verify real-time sync
4. Kill one server instance — verify client reconnects and recovers state
5. Open same user in incognito (different device) — verify state consistency
6. Check MongoDB to confirm data is persisted centrally

### Automated
- Not required per the assignment, but we can add a simple health check endpoint

---

## Open Questions

> [!IMPORTANT]
> **Deployment**: The challenge says "must be reachable via a live URL". Should I deploy to a cloud provider (e.g., Railway, Render, DigitalOcean)? Or is Docker Compose on a local machine sufficient for now? I'll proceed with Docker Compose for local + add deployment instructions.

> [!NOTE]
> **Collaborative feature choice**: I'm going with a Kanban task board. It's simple, demonstrates all requirements, and is visually clear. Let me know if you'd prefer something different (e.g., shared text editor, whiteboard).
