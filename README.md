# Distributed Real-Time Sync — Collaborative Enterprise Kanban Board

> **Digiryte UK — Technical Challenge (Round 3 Assessment)**  
> **Candidate:** Santhosh VS  
> **Challenge:** Challenge 2 — Enterprise Real-Time Sync & Multi-Node Cluster

An enterprise-grade, distributed real-time collaborative Kanban system built with **Node.js, Express, Socket.io, Redis Pub/Sub, MongoDB, Zod, JWT, and React (Tailwind CSS)**.

<div align="center">

[![Live Demo](https://img.shields.io/badge/🚀%20Live%20Demo-digiryte--challenge--02.vercel.app-db4435?style=for-the-badge&logo=vercel&logoColor=white)](https://digiryte-challenge-02.vercel.app/)

</div>

---

## Architecture & Cluster Overview

```
                 ┌────────────────────────────────────────────────────────┐
                 │          Browser Clients (Tabs / Devices)              │
                 │   (JWT authenticated, room-scoped to boardId)          │
                 └───────────────────────────┬────────────────────────────┘
                                             │
                             WebSocket (ws://) connection
                                             │
                                             ▼
                 ┌────────────────────────────────────────────────────────┐
                 │          Load Balancer (Port 3000)                     │
                 │   Node.js http-proxy — round-robin + WS proxy          │
                 └──────────────┬───────────────────────────┬─────────────┘
                                │                           │
                 ┌──────────────┴───────────┐   ┌───────────┴─────────────┐
                 ▼                          ▼   ▼                         ▼
  ┌───────────────────────────┐       ┌───────────────────────────┐   ┌───────────────┐
  │     Server Instance 1     │       │     Server Instance 2     │   │  /health &    │
  │        (Port 3001)        │       │        (Port 3002)        │   │  /metrics     │
  │ Socket Auth + Zod hardener│       │ Socket Auth + Zod hardener│   └───────────────┘
  └─────────────┬─────────────┘       └─────────────┬─────────────┘
                │                                   │
                │     @socket.io/redis-adapter      │
                │     (Pub/Sub room broadcasting)   │
                └─────────────────┬─────────────────┘
                                  ▼
                 ┌────────────────────────────────────────────────────────┐
                 │                 Redis Pub/Sub & Presence               │
                 │    Board Room events & active presence tracking        │
                 └────────────────────────┬───────────────────────────────┘
                                          ▼
                 ┌────────────────────────────────────────────────────────┐
                 │                MongoDB (Atlas or Local)                │
                 │ Single source of truth with fractional index ordering  │
                 └────────────────────────────────────────────────────────┘
```

---

## Technical Enhancements & Enterprise Hardening

| Feature Area | Key Vulnerability Addressed | Enterprise Technical Implementation |
|---|---|---|
| **Socket Authentication** | Sockets accepted raw `userId` in query string with no verification | JWT Token verification in `io.use()` middleware (`middleware/socketAuth.js`). Token issued via `/api/auth/token` endpoint. |
| **Room Scoping** | `io.emit()` broadcasted every event globally to all users | Scoped broadcasts strictly to `board:${boardId}` rooms. Multi-room isolation supported. |
| **Redis Fail-Fast & Health** | Redis disconnection caused silent split-brain | `/health` checks Mongo & Redis, returning `503 Service Unavailable` if unhealthy. `REDIS_STRICT=true` fails fast on startup. |
| **Ordering & Race Conditions** | `countDocuments` ordering created race conditions on concurrent adds | Fractional Indexing string keys (`fractional-indexing` package, e.g. `'a0'`, `'a1'`) eliminate index reordering races. |
| **Optimistic Concurrency** | Concurrent task edits silently overwrote each other | Added incrementing `version` field to `Task` model. Mismatched version edits are rejected with structured `CONCURRENCY_CONFLICT` error. |
| **Schema Validation** | `findByIdAndUpdate` bypassed Mongoose validators | Passed `{ runValidators: true, new: true }` on all Mongoose update operations. Payload validation enforced via `Zod` schemas. |
| **Incremental Reconnect Recovery** | Client re-fetched full board state on every reconnect | Incremental delta event logs (`BoardEvent` model) send missed delta updates since client's `lastSeenVersion`. |
| **Idempotent Retries & Offline Queue** | Network retries duplicated mutations | Client generates `clientMutationId` per mutation; server deduplicates retried requests via `IdempotencyManager`. Pending changes queued offline and flushed on reconnect. |
| **Socket Hardening & Rate Limiting** | Sockets vulnerable to payload spam and malformed inputs | Per-socket sliding-window rate limiter (`defaultLimiter`, max 20 events/5s) and Zod payload validation for all socket handlers. |
| **Infrastructure & Docker** | Non-serverless container orchestration | Multi-stage `Dockerfile` and `docker-compose.yml` orchestrating Server 1, Server 2, Node Load Balancer, Redis, and MongoDB. |
| **Metrics & Health** | Lack of cluster monitoring | Exposed `/metrics` endpoint returning active connections, memory footprint, board count, and Redis adapter status. |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ / 20+ |
| Backend Server | Express 4, Socket.io 4.x |
| Cross-Instance Sync | `@socket.io/redis-adapter` + Redis 7.x |
| Database | MongoDB via Mongoose (Atlas or local container) |
| Data Validation | Zod 3.x |
| Security | JSON Web Tokens (`jsonwebtoken`) |
| Ordering System | Fractional Indexing (`fractional-indexing`) |
| Orchestration | Docker, Docker Compose |
| Frontend | React 19, Vite 8, Tailwind CSS v4 |

---

## Project Directory Structure

```
digiryte-challenge-02/
├── server.js                  # Enterprise Express + Socket.io server (JWT, Zod, Redis adapter, Delta sync)
├── load-balancer.js           # HTTP/WebSocket load balancer proxy across server nodes
├── Dockerfile                 # Multi-stage production Docker build
├── docker-compose.yml         # Container orchestration (Mongo, Redis, Server1, Server2, Load Balancer)
├── middleware/
│   └── socketAuth.js          # JWT authentication middleware for Socket.IO (`io.use()`)
├── models/
│   ├── Task.js                # Task model (boardId, title, column, fractional order, version)
│   └── BoardEvent.js          # Board event log model for incremental delta sync recovery
├── utils/
│   ├── validation.js          # Zod payload validation schemas (`taskCreate`, `taskMove`, `taskDelete`)
│   ├── rateLimiter.js         # Sliding-window per-socket rate limiter
│   └── idempotency.js         # Client mutation ID deduplication manager
├── tests/
│   └── sync.test.js           # Multi-instance dual-client integration test & mid-session failover runner
├── client/
│   ├── index.html             # React SPA entry
│   ├── vite.config.js         # Vite configuration
│   └── src/
│       ├── socket.js          # Socket client (JWT handshake, delta version tracking, offline queue)
│       ├── App.jsx            # Main React component (Optimistic UI, presence, board switcher)
│       └── components/
│           ├── StatusBar.jsx   # Cluster status, board room selector, online presence list
│           ├── Column.jsx      # Kanban column wrapper
│           └── TaskCard.jsx    # Task card with drag-and-drop support
```

---

## Local Development & Testing Instructions

### 1. Run Automated Integration Tests

Executes the automated multi-node integration test suite:
- Connects dual `socket.io-client` connections on ports 3005 and 3006
- Tests JWT authentication & room scoping
- Verifies cross-node Redis event broadcasting
- Validates Zod payload rejection & optimistic concurrency conflicts
- Kills Server 1 mid-session and verifies failover to Server 2 without data loss

```bash
npm test
```

### 2. Run Local Multi-Instance Cluster

In separate terminal windows:

```bash
# Terminal 1: Server Instance 1 (Port 3001)
npm run server1

# Terminal 2: Server Instance 2 (Port 3002)
npm run server2

# Terminal 3: Node Load Balancer (Port 3000)
npm run lb

# Terminal 4: Client Dev Server (Port 5173)
npm run client:dev
```

### 3. Run via Docker Compose

Spin up the entire cluster (MongoDB, Redis, Server 1, Server 2, and Load Balancer) in containers:

```bash
docker-compose up --build
```

Access points:
- **Load Balancer**: `http://localhost:3000`
- **Server 1**: `http://localhost:3001`
- **Server 2**: `http://localhost:3002`
- **Health Endpoint**: `http://localhost:3001/health`
- **Metrics Endpoint**: `http://localhost:3001/metrics`

---

## Verification & Test Scenarios

1. **Room Isolation**: Open two tabs with different board IDs (`board-A` vs `board-B`) using the Board Room selector in the header. Actions in `board-A` are strictly scoped and do not leak to `board-B`.
2. **Offline Mutation Queue**: Click **"Simulate Disconnect"** or turn off network, create/move tasks while offline, and observe pending mutations flushing automatically upon reconnect.
3. **Concurrency Conflict**: Attempt to move a task with a stale version. The UI displays an error toast notification (`⚠️ Move Rejected: Task was updated by another user`) and refreshes state.
4. **Presence Tracking**: Open multiple tabs in the same board room to observe active online user counts in real time.
