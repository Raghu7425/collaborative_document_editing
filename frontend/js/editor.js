import { requireAuth, logout, getToken } from './auth.js';
import { api } from './api.js';

// ─── OT Client ───────────────────────────────────────────────────────────────
class OTClient {
  constructor(revision, content) {
    this.revision = revision;
    this.content = content;
    this.pending = null;   // sent, awaiting ack
    this.queue = [];       // buffered while pending
  }

  // Returns op to send, or null if buffered
  submit(op) {
    this._applyLocal(op);
    if (!this.pending) {
      const out = { ...op, base_revision: this.revision, client_operation_id: uid() };
      this.pending = out;
      return out;
    }
    this.queue.push(op);
    return null;
  }

  // Call on ack; returns next op to send or null
  ack(revision) {
    this.revision = revision;
    this.pending = null;
    if (this.queue.length > 0) {
      const next = { ...this.queue.shift(), base_revision: this.revision, client_operation_id: uid() };
      this.pending = next;
      return next;
    }
    return null;
  }

  // Apply remote op; returns the transformed op (position-adjusted for local display)
  remote(op, revision) {
    let incoming = { ...op };
    if (this.pending) {
      [incoming, this.pending] = xform(incoming, this.pending);
    }
    for (let i = 0; i < this.queue.length; i++) {
      [incoming, this.queue[i]] = xform(incoming, this.queue[i]);
    }
    this.revision = revision;
    this._applyLocal(incoming);
    return incoming;
  }

  _applyLocal(op) {
    if (op.type === 'insert') {
      this.content = this.content.slice(0, op.position) + op.text + this.content.slice(op.position);
    } else if (op.type === 'delete') {
      this.content = this.content.slice(0, op.position) + this.content.slice(op.position + op.length);
    }
  }
}

// OT transform: returns [transformed_a, transformed_b]
// a = incoming remote op, b = local pending/queued op
function xform(a, b) {
  a = { ...a }; b = { ...b };
  if (a.type === 'insert' && b.type === 'insert') {
    if (a.position <= b.position) b.position += a.text.length;
    else a.position += b.text.length;
  } else if (a.type === 'insert' && b.type === 'delete') {
    if (a.position <= b.position) b.position += a.text.length;
    else if (a.position < b.position + b.length) { a.position = b.position; b.length += a.text.length; }
    else a.position -= b.length;
  } else if (a.type === 'delete' && b.type === 'insert') {
    if (b.position <= a.position) a.position += b.text.length;
    else if (b.position < a.position + a.length) { b.position = a.position; a.length += b.text.length; }
    else b.position -= a.length;
  } else if (a.type === 'delete' && b.type === 'delete') {
    if (a.position + a.length <= b.position) { b.position -= a.length; }
    else if (b.position + b.length <= a.position) { a.position -= b.length; }
    else {
      const start = Math.min(a.position, b.position);
      const aEnd = a.position + a.length, bEnd = b.position + b.length;
      const end = Math.max(aEnd, bEnd);
      if (a.position <= b.position) {
        const overlap = Math.min(aEnd, bEnd) - b.position;
        b.position = a.position; b.length = Math.max(0, b.length - overlap);
        a.length = Math.max(0, end - start - b.length);
      } else {
        const overlap = Math.min(aEnd, bEnd) - a.position;
        a.position = b.position; a.length = Math.max(0, a.length - overlap);
        b.length = Math.max(0, end - start - a.length);
      }
    }
  }
  return [a, b];
}

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 11));
}

// ─── Cursor Canvas ────────────────────────────────────────────────────────────
const USER_COLORS = ['#4285F4','#EA4335','#34A853','#FBBC04','#FF6D00','#7B1FA2','#00BCD4','#E91E63'];
const colorMap = new Map();
let colorIndex = 0;

function getColor(userId) {
  if (!colorMap.has(userId)) colorMap.set(userId, USER_COLORS[colorIndex++ % USER_COLORS.length]);
  return colorMap.get(userId);
}

function getLineHeight(el) {
  const lh = parseFloat(getComputedStyle(el).lineHeight);
  return isNaN(lh) ? parseFloat(getComputedStyle(el).fontSize) * 1.5 : lh;
}

function measureLineWidth(text, el) {
  const canvas = measureLineWidth._canvas || (measureLineWidth._canvas = document.createElement('canvas'));
  const ctx = canvas.getContext('2d');
  const s = getComputedStyle(el);
  ctx.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
  return ctx.measureText(text).width;
}

function drawCursors(textarea, canvas, remoteCursors) {
  canvas.width = textarea.offsetWidth;
  canvas.height = textarea.offsetHeight;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const lh = getLineHeight(textarea);
  const padTop = parseInt(getComputedStyle(textarea).paddingTop) || 12;
  const padLeft = parseInt(getComputedStyle(textarea).paddingLeft) || 16;
  const content = textarea.value;

  for (const user of Object.values(remoteCursors)) {
    if (user.cursor == null || user.cursor.position == null) continue;
    const pos = Math.min(user.cursor.position, content.length);
    const textBefore = content.slice(0, pos);
    const lines = textBefore.split('\n');
    const lineNum = lines.length - 1;
    const lineText = lines[lineNum];
    const y = padTop + lineNum * lh - textarea.scrollTop;
    if (y + lh < 0 || y > canvas.height) continue;

    const color = getColor(user.user_id);
    const x = padLeft + measureLineWidth(lineText, textarea);

    // Line highlight
    ctx.fillStyle = color + '22';
    ctx.fillRect(0, y, canvas.width, lh);

    // Cursor caret
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + 1);
    ctx.lineTo(x, y + lh - 1);
    ctx.stroke();

    // Name badge
    const label = (user.name || user.email || 'User').slice(0, 10);
    const s = getComputedStyle(textarea);
    ctx.font = `bold 11px ${s.fontFamily}`;
    const badgeW = ctx.measureText(label).width + 10;
    const badgeY = Math.max(2, y - 20);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, badgeY, badgeW, 18, 3) : ctx.rect(x, badgeY, badgeW, 18);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x + 5, badgeY + 13);
  }
}

// ─── Change detection ─────────────────────────────────────────────────────────
function detectChange(oldText, newText) {
  if (oldText === newText) return null;
  // Find common prefix
  let s = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (s < minLen && oldText[s] === newText[s]) s++;
  // Find common suffix
  let oldE = oldText.length, newE = newText.length;
  while (oldE > s && newE > s && oldText[oldE - 1] === newText[newE - 1]) { oldE--; newE--; }
  const deleted = oldText.slice(s, oldE);
  const inserted = newText.slice(s, newE);
  return { position: s, deleted, inserted };
}

// Adjust local cursor after a remote op is applied
function adjustCursor(cursorPos, op) {
  if (op.type === 'insert') {
    return cursorPos >= op.position ? cursorPos + op.text.length : cursorPos;
  } else if (op.type === 'delete') {
    if (cursorPos > op.position + op.length) return cursorPos - op.length;
    if (cursorPos > op.position) return op.position;
  }
  return cursorPos;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const token = requireAuth();
const params = new URLSearchParams(location.search);
const inviteToken = params.get('token');
const docId = params.get('doc');

let otClient = null;
let ws = null;
let remoteCursors = {};
let currentUser = null;
let isApplyingRemote = false;
let prevContent = '';
let saveTimer = null;
let reconnectTimeout = null;
let reconnectDelay = 1000;

const textarea    = document.getElementById('editor-textarea');
const canvas      = document.getElementById('cursor-canvas');
const titleInput  = document.getElementById('doc-title');
const statusDot   = document.getElementById('status-dot');
const statusLabel = document.getElementById('status-label');
const usersBar    = document.getElementById('users-bar');
const wordCount   = document.getElementById('word-count');
const revCount    = document.getElementById('rev-count');
const shareBtnEl  = document.getElementById('share-btn');
const shareModal  = document.getElementById('share-modal');
const shareLinkIn = document.getElementById('share-link-input');
const copyLinkBtn = document.getElementById('copy-link-btn');
const closeModal  = document.getElementById('close-modal');
const toastEl     = document.getElementById('toast');

async function init() {
  try {
    currentUser = await api.me();
  } catch { logout(); return; }

  // Handle invite flow
  if (inviteToken && !docId) {
    try {
      const result = await api.acceptInvite(inviteToken);
      window.location.href = `/editor?doc=${result.document_id}`;
      return;
    } catch (e) {
      showToast('Invalid or expired invite link', 'error');
      setTimeout(() => window.location.href = '/dashboard', 2000);
      return;
    }
  }

  if (!docId) { window.location.href = '/dashboard'; return; }

  let doc;
  try {
    doc = await api.getDocument(docId);
  } catch (e) {
    showToast('Document not found', 'error');
    setTimeout(() => window.location.href = '/dashboard', 2000);
    return;
  }

  titleInput.value = doc.title;
  textarea.value = doc.content;
  prevContent = doc.content;
  otClient = new OTClient(doc.current_revision, doc.content);
  updateStats();
  connectWS();
}

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}/ws/documents/${docId}?token=${getToken()}&last_revision=${otClient.revision}`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    setStatus('connected');
    reconnectDelay = 1000;
    clearTimeout(reconnectTimeout);
    startPing();
  };

  ws.onmessage = (e) => {
    handleMessage(JSON.parse(e.data));
  };

  ws.onerror = () => setStatus('error');

  ws.onclose = () => {
    setStatus('reconnecting');
    reconnectTimeout = setTimeout(() => connectWS(), reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 15000);
  };
}

let pingInterval = null;
function startPing() {
  clearInterval(pingInterval);
  pingInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
  }, 25000);
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'pong': break;

    case 'recovery':
      for (const op of msg.operations) {
        applyRemoteOp(op.payload, op.revision, '');
      }
      break;

    case 'operation_committed': {
      if (msg.user_id === currentUser?.id?.toString()) break; // own op echoed back (shouldn't happen but guard)
      const op = { type: msg.operation_type, ...msg.operation };
      applyRemoteOp(op, msg.revision, msg.user_id);
      break;
    }

    case 'ack': {
      const next = otClient.ack(msg.revision);
      if (next) sendOp(next);
      setSaveStatus('saved');
      revCount.textContent = 'Rev ' + msg.revision;
      break;
    }

    case 'presence':
      updateRemoteCursors(msg.users);
      break;

    case 'title_changed':
      if (msg.user_id !== currentUser?.id?.toString()) {
        titleInput.value = msg.title;
        document.title = msg.title + ' — CollabDocs';
      }
      break;

    case 'error':
      showToast('Server error: ' + msg.code, 'error');
      break;
  }
}

function applyRemoteOp(op, revision, userId) {
  const savedStart = textarea.selectionStart;
  const savedEnd = textarea.selectionEnd;
  const transformed = otClient.remote(op, revision);
  isApplyingRemote = true;
  textarea.value = otClient.content;
  prevContent = otClient.content;
  isApplyingRemote = false;
  textarea.selectionStart = adjustCursor(savedStart, transformed);
  textarea.selectionEnd = adjustCursor(savedEnd, transformed);
  updateStats();
  scheduleRedraw();
}

function sendOp(op) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'operation', operation: op }));
    setSaveStatus('saving');
  }
}

// ─── Text input handling ──────────────────────────────────────────────────────
textarea.addEventListener('input', () => {
  if (isApplyingRemote) return;
  const newContent = textarea.value;
  const diff = detectChange(prevContent, newContent);
  prevContent = newContent;
  if (!diff) return;

  const ops = [];
  if (diff.deleted.length > 0) ops.push({ type: 'delete', position: diff.position, length: diff.deleted.length, text: '' });
  if (diff.inserted.length > 0) ops.push({ type: 'insert', position: diff.position, text: diff.inserted, length: 0 });

  for (const op of ops) {
    const toSend = otClient.submit(op);
    if (toSend) sendOp(toSend);
  }

  updateStats();
  sendPresence();
});

textarea.addEventListener('keyup', sendPresence);
textarea.addEventListener('click', sendPresence);
textarea.addEventListener('scroll', () => scheduleRedraw());

function sendPresence() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: 'presence',
    presence: {
      cursor: { position: textarea.selectionStart },
      typing: true,
    }
  }));
}

// ─── Title editing ────────────────────────────────────────────────────────────
let titleTimer = null;
titleInput.addEventListener('input', () => {
  clearTimeout(titleTimer);
  titleTimer = setTimeout(() => {
    const title = titleInput.value.trim();
    if (!title) return;
    document.title = title + ' — CollabDocs';
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'title_change', title }));
    }
  }, 600);
});

// ─── Presence / cursors ───────────────────────────────────────────────────────
function updateRemoteCursors(users) {
  remoteCursors = {};
  const avatars = [];
  for (const u of users) {
    if (u.user_id === currentUser?.id?.toString()) continue;
    remoteCursors[u.user_id] = u;
    const color = getColor(u.user_id);
    const initial = (u.name || u.email || '?')[0].toUpperCase();
    avatars.push(`<span class="user-avatar" style="background:${color}" title="${u.email || u.user_id}">${initial}</span>`);
  }
  usersBar.innerHTML = avatars.join('');
  scheduleRedraw();
}

let rafId = null;
function scheduleRedraw() {
  if (!rafId) rafId = requestAnimationFrame(() => { rafId = null; drawCursors(textarea, canvas, remoteCursors); });
}

// Resize canvas when window resizes
const ro = new ResizeObserver(() => scheduleRedraw());
ro.observe(textarea);

// ─── Status helpers ───────────────────────────────────────────────────────────
function setStatus(state) {
  statusDot.className = 'status-dot ' + state;
  statusLabel.textContent = { connected: 'Connected', reconnecting: 'Reconnecting…', error: 'Disconnected' }[state] || state;
}

function setSaveStatus(state) {
  clearTimeout(saveTimer);
  const el = document.getElementById('save-status');
  el.textContent = state === 'saving' ? 'Saving…' : '✓ Saved';
  el.className = 'save-status ' + state;
  if (state === 'saved') saveTimer = setTimeout(() => { el.textContent = ''; }, 2500);
}

function updateStats() {
  const text = textarea.value;
  wordCount.textContent = text.trim() ? text.trim().split(/\s+/).length + ' words' : '0 words';
}

// ─── Share modal ──────────────────────────────────────────────────────────────
shareBtnEl.addEventListener('click', async () => {
  try {
    const result = await api.generateShareLink(docId);
    shareLinkIn.value = result.url;
    shareModal.classList.add('open');
  } catch (e) {
    showToast('Could not generate share link: ' + e.message, 'error');
  }
});

copyLinkBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(shareLinkIn.value);
    copyLinkBtn.textContent = '✓ Copied!';
    setTimeout(() => copyLinkBtn.textContent = 'Copy', 2000);
  } catch {
    shareLinkIn.select();
    document.execCommand('copy');
  }
});

closeModal.addEventListener('click', () => shareModal.classList.remove('open'));
shareModal.addEventListener('click', (e) => { if (e.target === shareModal) shareModal.classList.remove('open'); });

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  toastEl.textContent = msg;
  toastEl.className = `toast toast-${type} show`;
  setTimeout(() => toastEl.classList.remove('show'), 3500);
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
document.getElementById('back-btn').addEventListener('click', () => window.location.href = '/dashboard');
document.getElementById('logout-btn').addEventListener('click', logout);

setStatus('reconnecting');
init();
