# Distributed Real-Time Sync — Collaborative Kanban Board

> **Digiryte UK — Technical Challenge (Round 3 Assessment)**  
> **Candidate:** Santhosh VS  
> **Challenge:** Distributed Real-Time Sync  

A distributed, real-time collaborative Kanban board built with **Node.js, Express, Socket.io, Redis Pub/Sub, MongoDB, and React (Tailwind CSS)**. The system runs across multiple server instances with state shared in real time through a Redis pub/sub adapter, central persistence in MongoDB, automatic reconnection on hard disconnects, and state recovery across different server nodes.

---

## Architecture Diagram

```
                 ┌──────────────────────────────────────────────┐
                 │       Browser Clients (Tabs / Devices)       │
                 │   (userId in localStorage, unique deviceId)   │
                 └──────────────────────┬───────────────────────┘
                                        │
                         WebSocket (ws://) connection
                                        │
                                        ▼
                 ┌──────────────────────────────────────────────┐
                 │       Load Balancer (Port 3000)              │
                 │     (or direct manual instance switching)    │
                 └──────────────┬────────────────┬──────────────┘
                                │                │
                   Round-Robin  │                │  Round-Robin
                                ▼                ▼
                 ┌─────────────────────┐  ┌─────────────────────┐
                 │  Server Instance 1  │  │  Server Instance 2  │
                 │     (Port 3001)     │  │     (Port 3002)     │
                 │   ID: "server-1"    │  │   ID: "server-2"    │
                 └──────────┬──────────┘  └──────────┬──────────┘
                            │                        │
                            │   @socket.io/redis     │
                            │       adapter          │
                            ▼                        ▼
                 ┌──────────────────────────────────────────────┐
                 │              Redis Pub/Sub Layer             │
                 │   (Broadcasts events across all instances)   │
                 └──────────────────────────────────────────────┘
                                        │
                                        │ Central Source of Truth
                                        ▼
                 ┌──────────────────────────────────────────────┐
                 │                MongoDB Database              │
                 │   (Task schema, order, status, author)       │
                 └──────────────────────────────────────────────┘
```

---

## Core Requirements & Implementation Mapping

| Requirement | Implementation Detail |
|---|---|
| **Multiple server instances (not single process)** | Run `npm run server1` (port 3001) and `npm run server2` (port 3002) simultaneously. |
| **Pub/sub layer (Redis adapter)** | Uses `@socket.io/redis-adapter` with Redis `pubClient` and `subClient`. An event emitted by a client on Server 1 is broadcasted through Redis and instantly received by clients connected to Server 2. |
| **Central state persistence (MongoDB)** | MongoDB holds all task documents (`models/Task.js`). Neither server instance holds state in memory; MongoDB is the single source of truth. |
| **Hard socket disconnect & auto-reconnect** | Socket.io client configured with `reconnection: true`. The UI provides a **"Simulate Disconnect"** button and displays real-time connection status overlay. When a server drops or network disconnects, the client detects it and reconnects automatically. |
| **State recovery across different instances** | On connection or reconnection, the server fetches the latest state directly from MongoDB via `Task.find()` and emits `state:sync`. Even if a client switches from Server 1 to Server 2, full state is immediately recovered. |
| **Multi-device / multi-tab consistency** | `userId` is persisted in `localStorage` across tabs, while each tab receives a unique `deviceId`. Sockets join a `user:${userId}` room. Changes in any tab instantly reflect across all tabs and devices. |
| **Load balancer / instance switching** | Includes both a built-in Node.js load balancer (`load-balancer.js` on port 3000) and an in-app **Target Selector** to switch between Server 1, Server 2, and the Load Balancer. |

---

## Tech Stack

- **Backend:** Node.js, Express, Socket.io 4.x, `@socket.io/redis-adapter`, Redis client 4.x, Mongoose (MongoDB)
- **Frontend:** React 19, Vite, Tailwind CSS v4, Socket.io Client
- **Load Balancer:** Node.js reverse proxy (`http-proxy`) with WebSocket upgrade forwarding

---

## Prerequisites

- **Node.js**: v18.0.0 or higher
- **MongoDB**: Local MongoDB instance (`mongodb://localhost:27017`) OR free cloud [MongoDB Atlas](https://www.mongodb.com/atlas) URI
- **Redis**: Local Redis instance (`redis://localhost:6379`) OR free cloud [Upstash Redis](https://upstash.com) URL

---

## Quick Start (Running Locally)

### 1. Clone & Install Dependencies

```bash
# Clone the repository
git clone <repo-url>
cd digiryte-challenge-02

# Install backend dependencies
npm install

# Install frontend dependencies
cd client && npm install && cd ..
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` with your MongoDB and Redis connection strings:

```env
PORT=3001
SERVER_ID=server-1
MONGODB_URI=mongodb://localhost:27017/kanban-sync
REDIS_URL=redis://localhost:6379
```

*(If using MongoDB Atlas or cloud Redis like Upstash, paste your connection URIs into `.env`)*.

---

### 3. Build the Frontend

Build the React + Tailwind client:

```bash
npm run build
```

---

### 4. Start the Distributed Cluster

Open separate terminal tabs:

#### Terminal 1: Start Server Instance 1 (Port 3001)
```bash
npm run server1
```

#### Terminal 2: Start Server Instance 2 (Port 3002)
```bash
npm run server2
```

#### Terminal 3: Start the Load Balancer (Port 3000)
```bash
npm run lb
```

*(Optional) Terminal 4: If you want hot-reloading for frontend development:*
```bash
npm run client:dev
```

---

## Verification & Testing Guide

### Test 1: Cross-Instance Real-Time Sync
1. Open **Tab 1** pointing to `http://localhost:3001` (Connected Node: `server-1`).
2. Open **Tab 2** pointing to `http://localhost:3002` (Connected Node: `server-2`).
3. Add a task in Tab 1 ("Review system design").
4. **Result:** The task immediately appears in Tab 2 in real-time, bridged across processes via Redis Pub/Sub.
5. Drag or click move buttons to move the task from "To Do" to "In Progress".
6. **Result:** Tab 1 updates simultaneously.

---

### Test 2: State Recovery Across Different Instances
1. Open a browser tab connected to `http://localhost:3001` (Server 1).
2. Add multiple tasks.
3. In the status bar, change **Target** from `Server 1 (Port 3001)` to `Server 2 (Port 3002)`.
4. The client connects to Server 2.
5. **Result:** Server 2 pulls full state from MongoDB and emits `state:sync`. The entire board is recovered with zero data loss.

---

### Test 3: Hard Disconnect & Auto-Reconnection
1. On any tab, click the red **"Simulate Disconnect"** button in the header.
2. The status indicator immediately switches to "Disconnected", the reconnection overlay appears, and reconnection attempts start.
3. Once the socket reconnects (after 2 seconds), the status turns green ("Connected") and all tasks are verified from MongoDB.
4. **Alternatively:** Kill Server 1 (`Ctrl+C` in Terminal 1). If connected through the load balancer (`http://localhost:3000`), the client detects the drop and reconnects to Server 2 automatically.

---

### Test 4: Multi-Tab / Multi-Device Synchronization
1. Open two tabs in the same browser (they share the same `userId` from `localStorage`, but have distinct `deviceId`s shown in the status bar).
2. Notice the status bar displays:
   `User: user-xxxx | Tab: device-yyyy`
3. Delete or move a task in one tab.
4. **Result:** The state updates instantaneously across both tabs, keeping the user's view in sync.

---

## NPM Scripts Reference

| Script | Command | Purpose |
|---|---|---|
| `npm run server1` | `PORT=3001 SERVER_ID=server-1 node server.js` | Runs Server Instance 1 |
| `npm run server2` | `PORT=3002 SERVER_ID=server-2 node server.js` | Runs Server Instance 2 |
| `npm run lb` | `node load-balancer.js` | Runs the WebSocket-aware load balancer on port 3000 |
| `npm run build` | `npm --prefix client run build` | Builds the React + Tailwind production bundle |
| `npm run client:dev` | `npm --prefix client run dev` | Runs the Vite development server with HMR |
| `npm start` | `node server.js` | Runs default server instance on port 3001 |

---

## Assumptions Made

1. **Transport Layer:** Socket.io is configured to prefer `transports: ['websocket']`. Pure WebSocket connections eliminate the need for session affinity / sticky sessions on HTTP polling fallbacks when distributing across multiple instances.
2. **Persistence Guarantee:** Every mutation (`task:create`, `task:move`, `task:delete`) is persisted to MongoDB *before* broadcasting through Redis Pub/Sub, ensuring that any reconnecting node always reads committed state.
3. **Identity Model:** A persistent `userId` in `localStorage` identifies a user across multiple tabs/windows on the same browser, while each tab generates a random `deviceId` in memory to demonstrate multi-device / multi-tab tracking.
