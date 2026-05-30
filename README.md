# CollabDocs — Real-Time Collaborative Document Editor

A full-stack, production-style collaborative document editor — similar to Google Docs — built with Python, FastAPI, and vanilla JavaScript. Multiple remote users can connect to the same document, see each other's live cursors, and type concurrently with automatic conflict resolution via Operational Transformation.

#demo

![1780114122130](image/README/1780114122130.gif)

## Features

- **Real-time collaborative editing** — changes from any user appear instantly for all connected users
- **Live cursors** — each collaborator's cursor and name are rendered inline with a unique colour
- **Shareable invite links** — document owners generate a one-click join URL; recipients get editor access after signing in
- **Concurrent write safety** — server-authoritative OT rebases conflicting operations; no lost keystrokes
- **Auto-reconnect** — clients reconnect and replay missed operations after a network drop
- **Full revision history** — every operation stored; rollback to any previous revision
- **Scalable broadcast** — Redis Pub/Sub fans out events across multiple API instances

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11, FastAPI, Uvicorn |
| Real-time | WebSockets, Redis Pub/Sub |
| Database | PostgreSQL 16 (async via asyncpg), SQLAlchemy 2, Alembic |
| Auth | JWT (python-jose), bcrypt (passlib) |
| Frontend | Vanilla HTML/CSS/JS, ES modules, Canvas API for cursors |
| Observability | Prometheus metrics, structlog JSON logs |
| Dev | Docker Compose, pytest, ruff, Locust |

---

## Setup & Running

### Option 1 — Docker Compose (recommended)

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

```bash
# 1. Enter the project directory
cd collaborative_document_editing

# 2. Start API, PostgreSQL, and Redis
docker compose up --build

# 3. In a second terminal, run migrations (first time only)
docker compose exec api alembic upgrade head

# 4. (Optional) Seed demo data
docker compose exec api python scripts/seed.py
```

Open **http://localhost:8000** — the login page loads immediately.

---

### Option 2 — Local Python (no Docker for the app)

**Prerequisites:** Python 3.11+, PostgreSQL 16, Redis 7.

**1. Install dependencies**

```bash
cd collaborative_document_editing
pip install -e ".[dev]"
```

**2. Start infrastructure**

If you have PostgreSQL and Redis installed locally, start them. Or spin up only the infrastructure containers:

```bash
docker compose up postgres redis -d
```

**3. Configure environment**

The `.env` file is already populated with local defaults — no changes needed for a local run:

```env
DATABASE_URL=postgresql+asyncpg://collab:collab@localhost:5432/collab
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=replace-with-32-byte-secret
```

**4. Run database migrations**

```bash
alembic upgrade head
```

**5. Start the development server**

```bash
uvicorn internal.app:app --host 0.0.0.0 --port 8000 --reload
```

Open **http://localhost:8000**.

---

### Testing collaborative editing with two users

1. Open **http://localhost:8000** → register as User A → create a document
2. Inside the editor, click **🔗 Share** → copy the invite link
3. Open the invite link in a second browser (or an incognito window) → register/login as User B
4. Both users now share the same document — type in either window and changes appear instantly in the other, with each user's cursor shown in a distinct colour

---

## URL Reference

| URL | Description |
|-----|-------------|
| `http://localhost:8000` | Login / Register |
| `http://localhost:8000/dashboard` | Document list |
| `http://localhost:8000/editor?doc={id}` | Document editor |
| `http://localhost:8000/invite?token={token}` | Join via share link |
| `http://localhost:8000/docs` | FastAPI interactive API docs (Swagger) |
| `http://localhost:8000/metrics` | Prometheus metrics endpoint |
| `http://localhost:9090` | Prometheus UI (Docker Compose only) |

## Architecture

```mermaid
flowchart LR
  ClientA[Editor Client A] --> WS1[API Instance 1 WebSocket]
  ClientB[Editor Client B] --> WS2[API Instance 2 WebSocket]
  WS1 --> SVC[Document Service]
  WS2 --> SVC
  SVC --> OT[Operational Transform Engine]
  SVC --> PG[(PostgreSQL)]
  SVC --> SNAP[Snapshot Strategy]
  WS1 <--> REDIS[(Redis Pub/Sub)]
  WS2 <--> REDIS
  SVC -. optional .-> KAFKA[(Kafka Operation Stream)]
  API[REST API] --> SVC
  PROM[Prometheus] --> API
```

## Data Model

Core tables:

- `users`: identity and password hashes
- `documents`: latest materialized document content and current revision
- `collaborators`: document ACLs
- `document_operations`: append-only operation history
- `document_snapshots`: periodic recovery checkpoints

The database is the source of truth. Redis is used only for low-latency distributed delivery between WebSocket instances.

## OT Strategy

Clients submit plain-text operations with a `base_revision`:

```json
{
  "type": "operation",
  "operation": {
    "type": "insert",
    "position": 12,
    "text": "hello",
    "base_revision": 8,
    "client_operation_id": "c-123"
  }
}
```

The server locks the document row, loads operations after the client base revision, rebases the incoming operation through the OT engine, applies the transformed operation to the materialized content, appends an immutable operation event, increments the revision, and broadcasts the committed operation.

This gives a single global revision order per document while still allowing clients to edit concurrently and recover from stale local state.

## WebSocket Flow

```mermaid
sequenceDiagram
  participant C as Client
  participant A as API Instance
  participant DB as PostgreSQL
  participant R as Redis Pub/Sub
  participant P as Peer Instance

  C->>A: connect /ws/documents/{id}?token=JWT&last_revision=N
  A->>DB: verify access + load operations after N
  A-->>C: recovery events
  C->>A: operation(base_revision)
  A->>DB: lock document + rebase + append operation
  A-->>C: ack(revision)
  A->>R: publish committed operation
  R-->>P: committed operation
  P-->>C: broadcast to local peers
```

## WebSocket Events

Presence:

```json
{
  "type": "presence",
  "presence": {
    "typing": true,
    "cursor": { "position": 42, "selection_length": 0 }
  }
}
```

Committed operation broadcast:

```json
{
  "type": "operation_committed",
  "revision": 9,
  "user_id": "4b7d...",
  "operation_type": "insert",
  "operation": {
    "position": 14,
    "text": "hello",
    "length": 0,
    "base_revision": 8,
    "client_operation_id": "c-123",
    "transformed": true
  }
}
```

Recovery:

```json
{
  "type": "recovery",
  "operations": [
    { "revision": 7, "operation_type": "delete", "payload": { "position": 2, "length": 3 } }
  ]
}
```

## Synchronization And Scaling

- Each API process keeps only local socket state.
- Every committed operation is persisted before broadcast.
- Redis Pub/Sub distributes events to all API instances.
- Reconnects provide `last_revision`; the server replays missed operations from PostgreSQL.
- Presence is ephemeral and distributed through the same fanout channel.
- PostgreSQL row locks serialize writes per document, avoiding split-brain revision assignment.

## Snapshot Strategy

The system stores every operation as an append-only event, then creates a snapshot every `SNAPSHOT_EVERY_N_OPERATIONS`. Recovery can start from the latest snapshot and replay only newer events. This keeps auditability while bounding replay cost.

## Reliability Tradeoffs

- OT is implemented for linear plain text, not rich block trees. A Notion-style block model would use typed operations per block.
- Redis Pub/Sub is low latency but not durable. Durability comes from PostgreSQL operation history.
- Per-document PostgreSQL locking is simple and correct. Very hot documents can later move to sharded operation sequencers or actor-style document workers.
- Kafka is included as an optional extension point for analytics, audit consumers, or async projections, but the critical write path does not depend on it.

## Useful Commands

```bash
alembic upgrade head
pytest
ruff check .
locust -f scripts/load_test.py --host http://localhost:8000
```

