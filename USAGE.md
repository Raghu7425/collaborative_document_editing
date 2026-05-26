# CollabDocs — Usage Guide

A step-by-step reference for using the collaborative canvas editor, its real-time features, share links, and the REST / WebSocket API.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Dashboard](#2-dashboard)
3. [Canvas Editor](#3-canvas-editor)
4. [Drawing Tools](#4-drawing-tools)
5. [Flowchart Shapes](#5-flowchart-shapes)
6. [Selecting, Moving, Resizing](#6-selecting-moving-resizing)
7. [Properties Panel](#7-properties-panel)
8. [Keyboard Shortcuts](#8-keyboard-shortcuts)
9. [Real-Time Collaboration](#9-real-time-collaboration)
10. [Share Links](#10-share-links)
11. [Zoom and Navigation](#11-zoom-and-navigation)
12. [REST API Reference](#12-rest-api-reference)
13. [WebSocket Protocol](#13-websocket-protocol)
14. [Load Testing](#14-load-testing)

---

## 1. Getting Started

### Create an account

1. Open `http://localhost:8000`
2. Click **Create an account**
3. Enter a valid email and a password (8–72 characters)
4. You are logged in automatically and redirected to the dashboard

### Sign in

1. Open `http://localhost:8000`
2. Enter your email and password
3. Click **Sign In**

> Passwords are bcrypt-hashed. The 72-byte limit is a bcrypt constraint — use plain ASCII passwords up to 72 characters.

---

## 2. Dashboard

The dashboard lists every document you own or have been invited to.

| Action | How |
|--------|-----|
| Create document | Click **+ New Document**, enter a title |
| Open document | Click the document card title or icon |
| Copy share link | Click the 🔗 icon on a card |
| Delete document | Click the 🗑 icon on a card (owners only) |

Documents are sorted by last-modified date, newest first.

---

## 3. Canvas Editor

Opening a document brings you to the full-screen canvas editor.

```
┌────────────────────────────────────────────────────────────────┐
│  ← [Document Title]          [Users] [Save] [🔗 Share] [● ●]  │  ← Toolbar
├──────────┬─────────────────────────────────────────┬───────────┤
│  Tools   │                                         │ Properties│
│  ──────  │           SVG Canvas                    │ (fill,    │
│  Select  │                                         │  stroke,  │
│  Rect    │   Drag to draw shapes                   │  font…)   │
│  Circle  │   Click to select                       │           │
│  Diamond │   Drag to move                          │           │
│  Text    │   Double-click to edit text             │           │
│  Arrow   │                                         │           │
│  ──────  │                                         │           │
│Flowchart │                                         │           │
│  presets │                                         │           │
└──────────┴─────────────────────────────────────────┴───────────┘
│  3 shapes   100%   −  +  ⊞  ⊹                                  │  ← Status bar
└────────────────────────────────────────────────────────────────┘
```

The **document title** in the toolbar is editable and syncs to all collaborators in real time.

---

## 4. Drawing Tools

Select a tool from the left panel or press its keyboard shortcut, then **click and drag** on the canvas to draw.

| Tool | Key | Description |
|------|-----|-------------|
| Select | `V` | Select, move, resize shapes |
| Rectangle | `R` | Draw a rectangle / process box |
| Circle | `C` | Draw a circle or ellipse |
| Diamond | `D` | Draw a diamond (decision node) |
| Text | `T` | Draw a text-only box |
| Arrow | `A` | Draw a directional arrow/connector |
| Rounded rect | — | Draw a rounded rectangle (Start/End terminal) |

**Tip:** All shapes snap to a 20 px grid automatically. Hold **Shift** while nudging with arrow keys to snap by one full grid unit.

---

## 5. Flowchart Shapes

The **Flowchart** section in the left panel drops a pre-styled shape at the center of the current view with a single click. No dragging needed.

| Button | Shape | Typical use |
|--------|-------|-------------|
| ⬭ Start/End | Rounded rectangle | First and last step of a flow |
| ▭ Process | Rectangle | A task or action |
| ◇ Decision | Diamond | Yes / No branch |
| ⬡ Data | Parallelogram | Input or output |
| 🗄 Database | Cylinder | Storage or data source |
| → Arrow | Line + arrowhead | Connecting two shapes |

The **Shapes** section adds utility shapes (note, alert, label) using the same one-click drop.

---

## 6. Selecting, Moving, Resizing

### Select
Click any shape with the **Select** tool (`V`). A dashed blue border with 8 handles appears.

### Move
Drag a selected shape to reposition it. Release to commit — the new position is synced to all collaborators.

### Resize
Drag any of the 8 corner/midpoint handles. The shape snaps to the 20 px grid.

### Delete
Press `Delete` or `Backspace` while a shape is selected, or click **Delete Shape** in the properties panel.

### Duplicate
Press `Ctrl+D` (or `Cmd+D` on Mac) or click **⧉ Duplicate** in the properties panel.

### Multi-select
Not yet supported — select one shape at a time.

---

## 7. Properties Panel

The right panel is active whenever a shape is selected.

| Property | What it controls |
|----------|-----------------|
| Fill | Background color of the shape. Click ⊘ for transparent. |
| Stroke | Border color. Click ⊘ for no border. |
| Stroke width | Border thickness (1–10 px) |
| Font size | Text label size (10–48 px) |
| Font color | Text label color |
| Opacity | Shape transparency (10–100 %) |
| Delete Shape | Removes the shape permanently |
| Duplicate | Creates a copy offset by 20 px |

All changes are applied immediately and broadcast to every connected collaborator.

---

## 8. Keyboard Shortcuts

### Tools
| Key | Action |
|-----|--------|
| `V` | Switch to Select tool |
| `R` | Switch to Rectangle tool |
| `C` | Switch to Circle tool |
| `D` | Switch to Diamond tool |
| `T` | Switch to Text tool |
| `A` | Switch to Arrow tool |
| `Escape` | Deselect / cancel current action |

### Editing
| Key | Action |
|-----|--------|
| `Delete` / `Backspace` | Delete selected shape |
| `Ctrl+D` | Duplicate selected shape |
| `Arrow keys` | Nudge selected shape by 2 px |
| `Shift+Arrow` | Nudge selected shape by 20 px (one grid) |
| Double-click | Edit text on a shape |
| `Enter` | Confirm text edit |
| `Shift+Enter` | New line in text edit |

### Canvas navigation
| Key / Action | Result |
|---|---|
| Scroll wheel | Zoom in / out at cursor |
| `+` / `=` | Zoom in |
| `-` | Zoom out |
| Alt + drag | Pan canvas |
| Middle-click + drag | Pan canvas |
| `⊞` button | Fit all shapes to screen |
| `⊹` button | Toggle dot grid |

---

## 9. Real-Time Collaboration

Any number of users can edit the same canvas simultaneously.

### What syncs instantly
- Shape creation
- Shape moves and resizes
- Style changes (fill, stroke, font, opacity)
- Shape deletion
- Document title edits

### Seeing other users
- **Avatars** in the top-right toolbar show who is currently connected. Each user gets a unique colour.
- **Cursor dots** on the canvas show where each collaborator's mouse is in real time, with a name badge.

### Connection states
| Indicator | Meaning |
|-----------|---------|
| 🟢 Connected | WebSocket active, all changes sync |
| 🟡 Reconnecting | Network drop — reconnects automatically with exponential back-off |
| 🔴 Disconnected | Persistent failure — refresh the page |

### Conflict handling
Each shape has a unique ID. Operations are applied in the order the server receives them. Last-write-wins per shape property — if two users move the same shape simultaneously, the final position is the one the server committed last.

---

## 10. Share Links

Share links let you invite anyone to join and edit a canvas.

### Generate a link
1. Open the canvas editor
2. Click **🔗 Share** in the top toolbar
3. Copy the URL shown in the modal

### What happens when someone opens the link
1. If they are not logged in, they land on the sign-in page
2. After signing in (or registering), they are automatically added as an **editor**
3. They are redirected to the canvas editor for that document

### Link behaviour
- The link is permanent once generated (same token reused on repeated clicks)
- Only the document **owner** can generate a share link
- There is currently no expiry or revocation — treat the link like a password

---

## 11. Zoom and Navigation

| Control | Action |
|---------|--------|
| Scroll wheel | Zoom centred on the cursor |
| `+` / `=` key | Zoom in by 25 % |
| `-` key | Zoom out by 25 % |
| Zoom-in button (`+`) | Zoom in |
| Zoom-out button (`−`) | Zoom out |
| Fit button (`⊞`) | Zoom to fit all shapes on screen |
| Alt + drag | Pan |
| Middle-click + drag | Pan |
| Grid toggle (`⊹`) | Show / hide dot grid |

Zoom range: **10 % – 400 %**. The current zoom level is displayed in the status bar.

---

## 12. REST API Reference

Base URL: `http://localhost:8000/api/v1`

Interactive docs: `http://localhost:8000/docs`

### Authentication

All endpoints (except register and login) require a JWT in the `Authorization` header:

```
Authorization: Bearer <token>
```

### Auth

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `POST` | `/auth/register` | `{"email":"…","password":"…"}` | `{"access_token":"…"}` |
| `POST` | `/auth/login` | `{"email":"…","password":"…"}` | `{"access_token":"…"}` |
| `GET`  | `/auth/me` | — | `{"id":"…","email":"…"}` |

### Documents

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `POST`   | `/documents` | `{"title":"…","content":""}` | Document |
| `GET`    | `/documents` | — | `[Document, …]` |
| `GET`    | `/documents/{id}` | — | Document |
| `PATCH`  | `/documents/{id}/rename` | `{"title":"…"}` | 204 |
| `DELETE` | `/documents/{id}` | — | 204 |
| `POST`   | `/documents/{id}/share-link` | — | `{"url":"…","token":"…"}` |
| `POST`   | `/documents/invite/{token}` | — | `{"document_id":"…","title":"…"}` |
| `GET`    | `/documents/{id}/operations?after_revision=N` | — | `[Operation, …]` |
| `POST`   | `/documents/{id}/rollback/{revision}` | — | Document |

**Document object:**
```json
{
  "id": "uuid",
  "owner_id": "uuid",
  "title": "My Canvas",
  "content": "{\"type\":\"canvas\",\"shapes\":{…}}",
  "current_revision": 42,
  "share_token": "abc123…",
  "created_at": "2026-05-27T10:00:00Z",
  "updated_at": "2026-05-27T10:05:00Z"
}
```

> The `content` field stores the full canvas state as a JSON string with the structure `{"type":"canvas","shapes":{"<id>":{…},…}}`.

---

## 13. WebSocket Protocol

Connect: `ws://localhost:8000/ws/documents/{document_id}?token=<JWT>&last_revision=<N>`

All frames are UTF-8 JSON text.

### Client → Server

**Canvas operation**
```json
{
  "type": "canvas_op",
  "op": {
    "kind": "add",
    "op_id": "unique-id",
    "shape": {
      "id": "uuid", "type": "rect",
      "x": 100, "y": 100, "w": 160, "h": 80,
      "fill": "#dbeafe", "stroke": "#2563eb", "strokeWidth": 2,
      "text": "Process", "fontSize": 14, "fontColor": "#1a1a2e", "opacity": 1
    }
  }
}
```

```json
{ "type": "canvas_op", "op": { "kind": "update", "id": "uuid", "changes": { "x": 200, "y": 150 } } }
```

```json
{ "type": "canvas_op", "op": { "kind": "delete", "id": "uuid" } }
```

**Presence (cursor position on canvas)**
```json
{ "type": "presence", "presence": { "cursor": { "position": 0 }, "cursor_xy": { "x": 340, "y": 210 } } }
```

**Title change**
```json
{ "type": "title_change", "title": "New Title" }
```

**Ping**
```json
{ "type": "ping" }
```

### Server → Client

**Canvas operation broadcast** (from another user)
```json
{ "type": "canvas_op", "op": { "kind": "update", "id": "uuid", "changes": {…} }, "user_id": "uuid" }
```

**Canvas ack** (confirms your operation was saved)
```json
{ "type": "canvas_ack", "op_id": "unique-id" }
```

**Presence update**
```json
{
  "type": "presence",
  "users": [
    { "user_id": "uuid", "email": "alice@example.com", "name": "alice", "cursor_xy": { "x": 340, "y": 210 } }
  ]
}
```

**Title changed** (from another user)
```json
{ "type": "title_changed", "title": "New Title", "user_id": "uuid" }
```

**Recovery** (missed operations since last_revision)
```json
{ "type": "recovery", "operations": [ { "revision": 5, "operation_type": "insert", "payload": {…} } ] }
```

**Pong**
```json
{ "type": "pong", "server_time": 1748342400.0 }
```

**Error**
```json
{ "type": "error", "code": "rate_limited" }
```

---

## 14. Load Testing

The project includes a [Locust](https://locust.io/) load test script at [scripts/load_test.py](scripts/load_test.py).

### Run

```bash
# Install dev dependencies if not already
pip install -e ".[dev]"

# Start locust (target a running instance)
locust -f scripts/load_test.py --host http://localhost:8000
```

Open `http://localhost:8089` in a browser to configure and start the test.

### What it tests
- User registration and login
- Document creation
- WebSocket connections with concurrent operation submission
- Presence broadcasts

### Recommended test parameters for local load testing

| Parameter | Value |
|-----------|-------|
| Users | 20–50 |
| Spawn rate | 5 users/sec |
| Host | `http://localhost:8000` |

Watch `docker compose logs api` and `http://localhost:9090` (Prometheus) during the test to observe connection counts and operation throughput.

---

## Appendix — Canvas Shape JSON Reference

All shapes share a common base. Fields marked `—` are not used for that type.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Unique shape identifier |
| `type` | string | `rect`, `rounded`, `circle`, `diamond`, `parallelogram`, `cylinder`, `text`, `arrow` |
| `x` | number | Left edge (or arrow start X) |
| `y` | number | Top edge (or arrow start Y) |
| `w` | number | Width (— for arrow) |
| `h` | number | Height (— for arrow) |
| `x2` | number | Arrow end X (arrow only) |
| `y2` | number | Arrow end Y (arrow only) |
| `rx` | number | Corner radius (rect / rounded) |
| `fill` | string | CSS colour or `transparent` |
| `stroke` | string | CSS colour or `none` |
| `strokeWidth` | number | Border thickness in px |
| `text` | string | Label text (newlines with `\n`) |
| `fontSize` | number | Label font size in px |
| `fontColor` | string | Label CSS colour |
| `opacity` | number | 0.0 – 1.0 |
