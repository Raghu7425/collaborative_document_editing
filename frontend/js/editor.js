import { requireAuth, logout, getToken } from './auth.js';
import { api } from './api.js';

requireAuth();

// ── Constants ─────────────────────────────────────────────────────────────────
const HANDLE = 8;
const MIN_SIZE = 20;
const GRID = 20;
const SWATCHES = ['#ffffff','#1e293b','#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#06b6d4','#f1f5f9','#475569'];
const NS = 'http://www.w3.org/2000/svg';

// ── State ─────────────────────────────────────────────────────────────────────
let docId = null, currentUser = null, ws = null;
let shapes = {};          // id → shape
let selected = null;      // shape id
let tool = 'select';
let zoom = 1, panX = 0, panY = 0;
let isPanning = false, panStart = null, panOrigin = null;
let isDrawing = false, drawStart = null, previewEl = null;
let isDragging = false, dragOffset = null, dragStart = null;
let isResizing = false, resizeHandle = '', resizeOrigin = null;
let editingId = null;
let showGrid = true;
let remoteCursors = {};
let fillColor = '#dbeafe', strokeColor = '#2563eb', strokeWidth = 2, fontSize = 14, fontColor = '#1a1a2e', opacity = 1;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const svg        = document.getElementById('canvas-svg');
const viewport   = document.getElementById('viewport');
const shapesLayer= document.getElementById('shapes-layer');
const drawLayer  = document.getElementById('drawing-layer');
const selLayer   = document.getElementById('selection-layer');
const gridBg     = document.getElementById('grid-bg');
const textOverlay= document.getElementById('text-overlay');
const propsPanel = document.getElementById('props-panel');
const propsEmpty = document.getElementById('props-empty');

// ── SVG helpers ───────────────────────────────────────────────────────────────
function el(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
function uid() { return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2); }

function svgPt(clientX, clientY) {
  const p = svg.createSVGPoint();
  p.x = clientX; p.y = clientY;
  return p.matrixTransform(viewport.getScreenCTM().inverse());
}

function snap(v) { return Math.round(v / GRID) * GRID; }

// ── Viewport transform ────────────────────────────────────────────────────────
function applyViewport() {
  viewport.setAttribute('transform', `translate(${panX},${panY}) scale(${zoom})`);
  document.getElementById('zoom-label').textContent = Math.round(zoom * 100) + '%';
}

// ── Shape rendering ───────────────────────────────────────────────────────────
function buildShape(s) {
  const g = el('g', { 'data-id': s.id });
  g.appendChild(buildShapeBody(s));
  if (s.text && s.type !== 'arrow') g.appendChild(buildText(s));
  g.appendChild(buildHitArea(s));
  return g;
}

function buildShapeBody(s) {
  const f = s.fill || '#dbeafe', st = s.stroke || '#2563eb', sw = s.strokeWidth || 2;
  const op = s.opacity != null ? s.opacity : 1;
  const base = { fill: f, stroke: st === 'none' ? 'none' : st, 'stroke-width': sw, opacity: op };

  switch (s.type) {
    case 'rect':
      return el('rect', { ...base, x: s.x, y: s.y, width: s.w, height: s.h, rx: s.rx || 0 });
    case 'rounded':
      return el('rect', { ...base, x: s.x, y: s.y, width: s.w, height: s.h, rx: s.rx ?? Math.min(s.h / 2, 30) });
    case 'circle': {
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      return el('ellipse', { ...base, cx, cy, rx: s.w / 2, ry: s.h / 2 });
    }
    case 'diamond': {
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      return el('polygon', { ...base, points: `${cx},${s.y} ${s.x+s.w},${cy} ${cx},${s.y+s.h} ${s.x},${cy}` });
    }
    case 'parallelogram': {
      const sk = Math.min(s.w * 0.15, 24);
      return el('polygon', { ...base, points: `${s.x+sk},${s.y} ${s.x+s.w},${s.y} ${s.x+s.w-sk},${s.y+s.h} ${s.x},${s.y+s.h}` });
    }
    case 'cylinder': {
      const rx2 = s.w / 2, ry2 = Math.min(s.h * 0.18, 18), cx2 = s.x + rx2;
      const ty = s.y + ry2, by = s.y + s.h - ry2;
      const d = `M${s.x},${ty} L${s.x},${by} A${rx2},${ry2} 0 0 0 ${s.x+s.w},${by} L${s.x+s.w},${ty} A${rx2},${ry2} 0 0 1 ${s.x},${ty}`;
      const path = el('path', { ...base, d });
      const cap  = el('ellipse', { ...base, cx: cx2, cy: ty, rx: rx2, ry: ry2 });
      const g2 = el('g'); g2.appendChild(path); g2.appendChild(cap); return g2;
    }
    case 'arrow': {
      const a = el('line', { ...base, fill: 'none', x1: s.x, y1: s.y, x2: s.x2, y2: s.y2,
        'marker-end': `url(#arrowhead)`, 'stroke-linecap': 'round' });
      return a;
    }
    case 'text':
      return el('rect', { x: s.x, y: s.y, width: s.w, height: s.h, fill: 'transparent', stroke: 'none' });
    default:
      return el('rect', { ...base, x: s.x, y: s.y, width: s.w, height: s.h });
  }
}

function buildText(s) {
  const tx = s.x + (s.w || 0) / 2, ty = s.y + (s.h || 0) / 2;
  const t = el('text', {
    x: tx, y: ty,
    'text-anchor': 'middle', 'dominant-baseline': 'central',
    'font-size': s.fontSize || 14,
    'font-family': '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    fill: s.fontColor || '#1a1a2e',
    'pointer-events': 'none',
  });
  // Wrap long text
  const words = (s.text || '').split('\n');
  if (words.length === 1) {
    t.textContent = s.text;
  } else {
    words.forEach((line, i) => {
      const ts = el('tspan', { x: tx, dy: i === 0 ? `${-(words.length - 1) * 0.6}em` : '1.2em' });
      ts.textContent = line;
      t.appendChild(ts);
    });
  }
  return t;
}

function buildHitArea(s) {
  if (s.type === 'arrow') {
    return el('line', { x1: s.x, y1: s.y, x2: s.x2 ?? s.x+80, y2: s.y2 ?? s.y,
      stroke: 'transparent', 'stroke-width': 12, 'data-hit': '1' });
  }
  return el('rect', { x: s.x - 2, y: s.y - 2, width: (s.w || 0) + 4, height: (s.h || 0) + 4,
    fill: 'transparent', stroke: 'none', 'data-hit': '1' });
}

function reRenderShape(s) {
  const existing = shapesLayer.querySelector(`[data-id="${s.id}"]`);
  const g = buildShape(s);
  if (existing) shapesLayer.replaceChild(g, existing);
  else shapesLayer.appendChild(g);
  g.addEventListener('mousedown', onShapeMouseDown);
  g.addEventListener('dblclick', onShapeDblClick);
}

function fullRender() {
  shapesLayer.innerHTML = '';
  for (const s of Object.values(shapes)) reRenderShape(s);
  updateShapeCount();
}

// ── Selection handles ─────────────────────────────────────────────────────────
function renderSelection(s) {
  selLayer.innerHTML = '';
  if (!s) return;
  if (s.type === 'arrow') {
    [{ pos: 'a-start', cx: s.x, cy: s.y }, { pos: 'a-end', cx: s.x2, cy: s.y2 }].forEach(h => {
      const r = el('circle', { cx: h.cx, cy: h.cy, r: HANDLE/2+1, fill: 'white', stroke: '#2563eb', 'stroke-width': 1.5, 'data-handle': h.pos, class: 'resize-handle' });
      selLayer.appendChild(r);
    });
    return;
  }
  const pad = 4;
  selLayer.appendChild(el('rect', { x: s.x-pad, y: s.y-pad, width: s.w+pad*2, height: s.h+pad*2,
    fill: 'none', stroke: '#2563eb', 'stroke-width': 1.5, 'stroke-dasharray': '6,3', 'pointer-events': 'none' }));
  const hs = [
    ['nw', s.x-pad,         s.y-pad],
    ['n',  s.x+s.w/2,       s.y-pad],
    ['ne', s.x+s.w+pad,     s.y-pad],
    ['e',  s.x+s.w+pad,     s.y+s.h/2],
    ['se', s.x+s.w+pad,     s.y+s.h+pad],
    ['s',  s.x+s.w/2,       s.y+s.h+pad],
    ['sw', s.x-pad,         s.y+s.h+pad],
    ['w',  s.x-pad,         s.y+s.h/2],
  ];
  for (const [pos, cx, cy] of hs) {
    const r = el('rect', { x: cx-HANDLE/2, y: cy-HANDLE/2, width: HANDLE, height: HANDLE,
      fill: 'white', stroke: '#2563eb', 'stroke-width': 1.5,
      'data-handle': pos, class: `resize-handle rh-${pos}` });
    selLayer.appendChild(r);
  }
}

// ── Properties panel ──────────────────────────────────────────────────────────
function showProps(s) {
  propsEmpty.style.display = 'none';
  document.querySelectorAll('.props-section').forEach(el => el.style.display = '');
  if (s) {
    document.getElementById('fill-custom').value    = s.fill && s.fill !== 'transparent' ? toHex(s.fill) : '#dbeafe';
    document.getElementById('stroke-custom').value  = s.stroke && s.stroke !== 'none' ? toHex(s.stroke) : '#2563eb';
    document.getElementById('stroke-width').value   = s.strokeWidth || 2;
    document.getElementById('sw-val').textContent   = s.strokeWidth || 2;
    document.getElementById('font-size').value      = s.fontSize || 14;
    document.getElementById('fs-val').textContent   = s.fontSize || 14;
    document.getElementById('font-color').value     = toHex(s.fontColor || '#1a1a2e');
    document.getElementById('opacity').value        = Math.round((s.opacity ?? 1) * 100);
    document.getElementById('op-val').textContent   = Math.round((s.opacity ?? 1) * 100);
    if (s.type === 'arrow') document.getElementById('fill-section').style.display = 'none';
    if (s.type === 'text')  document.getElementById('fill-section').style.display = 'none';
  }
}

function hideProps() {
  document.querySelectorAll('.props-section').forEach(el => el.style.display = 'none');
  propsEmpty.style.display = '';
}

function toHex(color) {
  if (!color || color === 'transparent' || color === 'none') return '#ffffff';
  if (color.startsWith('#')) return color;
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = color;
  return c.fillStyle;
}

// ── Shape CRUD ────────────────────────────────────────────────────────────────
function addShape(s) {
  shapes[s.id] = s;
  reRenderShape(s);
  updateShapeCount();
  syncOp({ kind: 'add', shape: s, op_id: uid() });
}

function updateShape(id, changes) {
  if (!shapes[id]) return;
  Object.assign(shapes[id], changes);
  reRenderShape(shapes[id]);
  if (selected === id) renderSelection(shapes[id]);
  syncOp({ kind: 'update', id, changes, op_id: uid() });
}

function deleteShape(id) {
  if (!shapes[id]) return;
  const g = shapesLayer.querySelector(`[data-id="${id}"]`);
  if (g) g.remove();
  delete shapes[id];
  if (selected === id) { selected = null; selLayer.innerHTML = ''; hideProps(); }
  updateShapeCount();
  syncOp({ kind: 'delete', id, op_id: uid() });
}

function duplicateShape(id) {
  const s = shapes[id];
  if (!s) return;
  const copy = { ...s, id: uid(), x: s.x + 20, y: s.y + 20 };
  if (s.x2 != null) { copy.x2 = s.x2 + 20; copy.y2 = s.y2 + 20; }
  addShape(copy);
  selectShape(copy.id);
}

function selectShape(id) {
  selected = id;
  renderSelection(shapes[id]);
  if (shapes[id]) showProps(shapes[id]);
}

function deselect() {
  selected = null; selLayer.innerHTML = '';
  hideProps();
}

function updateShapeCount() {
  const n = Object.keys(shapes).length;
  document.getElementById('shape-count').textContent = `${n} shape${n !== 1 ? 's' : ''}`;
}

// ── Shape factory ─────────────────────────────────────────────────────────────
function makeShape(type, x, y, w, h, overrides = {}) {
  const defaults = {
    rect:          { fill: '#dbeafe', stroke: '#2563eb', text: 'Process' },
    rounded:       { fill: '#dcfce7', stroke: '#16a34a', text: 'Start / End' },
    circle:        { fill: '#fce7f3', stroke: '#db2777', text: '' },
    diamond:       { fill: '#fef9c3', stroke: '#ca8a04', text: 'Decision?' },
    parallelogram: { fill: '#ede9fe', stroke: '#7c3aed', text: 'Data' },
    cylinder:      { fill: '#e0f2fe', stroke: '#0284c7', text: 'Database' },
    text:          { fill: 'transparent', stroke: 'none', text: 'Double-click to edit' },
    arrow:         { fill: 'none', stroke: '#475569', text: '' },
  }[type] || { fill: fillColor, stroke: strokeColor };

  return {
    id: uid(), type,
    x, y, w: Math.max(w, MIN_SIZE), h: Math.max(h, MIN_SIZE),
    x2: type === 'arrow' ? x + w : undefined,
    y2: type === 'arrow' ? y + h : undefined,
    fontSize, fontColor, strokeWidth,
    opacity: opacity,
    ...defaults,
    fill: overrides.fill || defaults.fill || fillColor,
    stroke: overrides.stroke || defaults.stroke || strokeColor,
    ...overrides,
    text: overrides.text !== undefined ? overrides.text : (defaults.text ?? ''),
  };
}

// ── Mouse interaction ─────────────────────────────────────────────────────────
svg.addEventListener('mousedown', onSvgMouseDown);
svg.addEventListener('mousemove', onSvgMouseMove);
window.addEventListener('mouseup', onMouseUp);
svg.addEventListener('wheel', onWheel, { passive: false });

function onShapeMouseDown(e) {
  if (tool !== 'select') return;
  e.stopPropagation();
  const id = e.currentTarget.getAttribute('data-id');
  const h = e.target.getAttribute('data-handle');
  const pt = svgPt(e.clientX, e.clientY);
  if (h) {
    // resize
    isResizing = true; resizeHandle = h;
    resizeOrigin = { ...shapes[id], mx: pt.x, my: pt.y };
    selectShape(id);
  } else {
    // drag
    selectShape(id);
    isDragging = true;
    dragOffset = { x: pt.x - shapes[id].x, y: pt.y - shapes[id].y };
    dragStart  = { x: shapes[id].x, y: shapes[id].y, x2: shapes[id].x2, y2: shapes[id].y2 };
  }
}

function onShapeDblClick(e) {
  e.stopPropagation();
  const id = e.currentTarget.getAttribute('data-id');
  startTextEdit(id);
}

function onSvgMouseDown(e) {
  const target = e.target;
  // Middle-click or space+drag → pan
  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    isPanning = true; panStart = { x: e.clientX, y: e.clientY }; panOrigin = { x: panX, y: panY };
    svg.style.cursor = 'grabbing'; return;
  }
  if (e.button !== 0) return;

  // Clicking on a resize handle (selection layer)
  const handle = target.getAttribute('data-handle');
  if (handle && selected) {
    const pt = svgPt(e.clientX, e.clientY);
    isResizing = true; resizeHandle = handle;
    resizeOrigin = { ...shapes[selected], mx: pt.x, my: pt.y };
    return;
  }

  // Clicking on empty canvas
  if (target === document.getElementById('canvas-bg') || target === gridBg || target === viewport || target.id === 'canvas-svg') {
    deselect();
    if (tool !== 'select') {
      const pt = svgPt(e.clientX, e.clientY);
      isDrawing = true;
      drawStart = { x: snap(pt.x), y: snap(pt.y) };
      previewEl = null;
    }
  }
}

function onSvgMouseMove(e) {
  if (isPanning) {
    panX = panOrigin.x + (e.clientX - panStart.x);
    panY = panOrigin.y + (e.clientY - panStart.y);
    applyViewport(); return;
  }
  const pt = svgPt(e.clientX, e.clientY);

  if (isDrawing && drawStart) {
    updatePreview(drawStart, snap(pt.x), snap(pt.y));
  }
  if (isDragging && selected) {
    const s = shapes[selected];
    let nx = snap(pt.x - dragOffset.x), ny = snap(pt.y - dragOffset.y);
    const dx = nx - s.x, dy = ny - s.y;
    const changes = { x: nx, y: ny };
    if (s.x2 != null) { changes.x2 = s.x2 + dx; changes.y2 = s.y2 + dy; }
    Object.assign(shapes[selected], changes);
    reRenderShape(shapes[selected]);
    renderSelection(shapes[selected]);
  }
  if (isResizing && selected && resizeOrigin) {
    applyResize(pt);
  }

  // Broadcast cursor
  broadcastCursor(pt.x, pt.y);
}

function onMouseUp(e) {
  if (isPanning) { isPanning = false; updateCursor(); return; }
  const pt = svgPt(e.clientX, e.clientY);

  if (isDrawing && drawStart) {
    const x1 = drawStart.x, y1 = drawStart.y;
    const x2 = snap(pt.x), y2 = snap(pt.y);
    const w = Math.abs(x2 - x1) || 120, h = Math.abs(y2 - y1) || 80;
    const sx = Math.min(x1, x2), sy = Math.min(y1, y2);
    if (previewEl) { previewEl.remove(); previewEl = null; }
    if (w > 5 || h > 5) {
      let s;
      if (tool === 'arrow') {
        s = makeShape('arrow', x1, y1, x2 - x1, y2 - y1);
        s.x2 = x2; s.y2 = y2;
      } else {
        s = makeShape(tool, sx, sy, w, h);
      }
      addShape(s);
      selectShape(s.id);
    }
    isDrawing = false; drawStart = null;
  }

  if (isDragging && selected) {
    const s = shapes[selected];
    if (s.x !== dragStart.x || s.y !== dragStart.y) {
      const changes = { x: s.x, y: s.y };
      if (s.x2 != null) { changes.x2 = s.x2; changes.y2 = s.y2; }
      syncOp({ kind: 'update', id: selected, changes, op_id: uid() });
    }
    isDragging = false;
  }

  if (isResizing && selected) {
    const s = shapes[selected];
    syncOp({ kind: 'update', id: selected, changes: { x: s.x, y: s.y, w: s.w, h: s.h, x2: s.x2, y2: s.y2 }, op_id: uid() });
    isResizing = false; resizeHandle = ''; resizeOrigin = null;
  }
}

function applyResize(pt) {
  const o = resizeOrigin, s = shapes[selected];
  const dx = pt.x - o.mx, dy = pt.y - o.my;
  let nx = o.x, ny = o.y, nw = o.w, nh = o.h;

  if (resizeHandle === 'a-end')   { s.x2 = snap(pt.x); s.y2 = snap(pt.y); }
  else if (resizeHandle === 'a-start') { s.x = snap(pt.x); s.y = snap(pt.y); }
  else {
    if (resizeHandle.includes('e')) nw = Math.max(MIN_SIZE, o.w + dx);
    if (resizeHandle.includes('s')) nh = Math.max(MIN_SIZE, o.h + dy);
    if (resizeHandle.includes('w')) { nx = o.x + dx; nw = Math.max(MIN_SIZE, o.w - dx); }
    if (resizeHandle.includes('n')) { ny = o.y + dy; nh = Math.max(MIN_SIZE, o.h - dy); }
    s.x = snap(nx); s.y = snap(ny); s.w = snap(nw); s.h = snap(nh);
  }
  reRenderShape(s);
  renderSelection(s);
}

function updatePreview(start, ex, ey) {
  if (previewEl) previewEl.remove();
  const w = Math.abs(ex - start.x) || 10, h = Math.abs(ey - start.y) || 10;
  const sx = Math.min(start.x, ex), sy = Math.min(start.y, ey);
  const preview = makeShape(tool === 'arrow' ? 'arrow' : tool, sx, sy, w, h);
  if (tool === 'arrow') { preview.x = start.x; preview.y = start.y; preview.x2 = ex; preview.y2 = ey; }
  preview.opacity = 0.6;
  previewEl = buildShape(preview);
  previewEl.setAttribute('pointer-events', 'none');
  drawLayer.appendChild(previewEl);
}

// ── Text editing ──────────────────────────────────────────────────────────────
function startTextEdit(id) {
  const s = shapes[id];
  if (!s || s.type === 'arrow') return;
  editingId = id;
  const container = document.getElementById('canvas-container');
  const cRect = container.getBoundingClientRect();

  // Get shape's screen position
  const p1 = svgToScreen(s.x, s.y);
  const p2 = svgToScreen(s.x + s.w, s.y + s.h);
  const left = p1.x - cRect.left, top = p1.y - cRect.top;
  const width = p2.x - p1.x, height = p2.y - p1.y;

  textOverlay.style.cssText = `
    display:block; position:absolute;
    left:${left}px; top:${top}px;
    width:${Math.max(width, 60)}px; height:${Math.max(height, 30)}px;
    font-size:${(s.fontSize || 14) * zoom}px;
    font-family:-apple-system,sans-serif;
    color:${s.fontColor || '#1a1a2e'};
    background:transparent; border:2px dashed #2563eb;
    padding:4px; resize:none; z-index:200; outline:none;
    text-align:center;
  `;
  textOverlay.value = s.text || '';
  textOverlay.focus();
  textOverlay.select();
}

function svgToScreen(x, y) {
  const pt = svg.createSVGPoint();
  pt.x = x; pt.y = y;
  return pt.matrixTransform(viewport.getScreenCTM());
}

textOverlay.addEventListener('blur', commitTextEdit);
textOverlay.addEventListener('keydown', e => {
  if (e.key === 'Escape') { textOverlay.style.display = 'none'; editingId = null; }
  if (e.key === 'Enter' && !e.shiftKey) { commitTextEdit(); e.preventDefault(); }
});

function commitTextEdit() {
  if (!editingId) return;
  const newText = textOverlay.value;
  textOverlay.style.display = 'none';
  updateShape(editingId, { text: newText });
  editingId = null;
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && selected) deleteShape(selected);
  if (e.key === 'v' || e.key === 'V') setTool('select');
  if (e.key === 'r' || e.key === 'R') setTool('rect');
  if (e.key === 'c' || e.key === 'C') setTool('circle');
  if (e.key === 'd' || e.key === 'D') setTool('diamond');
  if (e.key === 't' || e.key === 'T') setTool('text');
  if (e.key === 'a' || e.key === 'A') setTool('arrow');
  if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); if (selected) duplicateShape(selected); }
  if (e.key === 'Escape') deselect();
  if (e.key === '+' || e.key === '=') setZoom(zoom * 1.2);
  if (e.key === '-') setZoom(zoom / 1.2);
  // Arrow keys to nudge
  if (selected && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
    e.preventDefault();
    const d = e.shiftKey ? GRID : 2;
    const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
    const dy = e.key === 'ArrowUp'   ? -d : e.key === 'ArrowDown'  ? d : 0;
    const s = shapes[selected];
    updateShape(selected, { x: s.x + dx, y: s.y + dy,
      x2: s.x2 != null ? s.x2 + dx : undefined, y2: s.y2 != null ? s.y2 + dy : undefined });
  }
});

// ── Zoom / Pan ────────────────────────────────────────────────────────────────
function onWheel(e) {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  const pt = svgPt(e.clientX, e.clientY);
  setZoom(zoom * factor, pt);
}

function setZoom(z, center = null) {
  const prev = zoom;
  zoom = Math.max(0.1, Math.min(4, z));
  if (center) {
    panX -= center.x * (zoom - prev);
    panY -= center.y * (zoom - prev);
  }
  applyViewport();
}

function fitCanvas() {
  if (Object.keys(shapes).length === 0) { zoom = 1; panX = 0; panY = 0; applyViewport(); return; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of Object.values(shapes)) {
    minX = Math.min(minX, s.x); minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, (s.x2 ?? s.x + (s.w||0)), s.x + (s.w||0));
    maxY = Math.max(maxY, (s.y2 ?? s.y + (s.h||0)), s.y + (s.h||0));
  }
  const cRect = document.getElementById('canvas-container').getBoundingClientRect();
  const pad = 60;
  const zx = (cRect.width - pad*2) / (maxX - minX || 1);
  const zy = (cRect.height - pad*2) / (maxY - minY || 1);
  zoom = Math.min(zx, zy, 2);
  panX = -minX * zoom + pad;
  panY = -minY * zoom + pad;
  applyViewport();
}

// ── Color swatches ────────────────────────────────────────────────────────────
function buildSwatches() {
  ['fill-swatches', 'stroke-swatches'].forEach((id, isFill) => {
    const container = document.getElementById(id);
    container.innerHTML = '';
    SWATCHES.forEach(color => {
      const b = document.createElement('button');
      b.className = 'swatch-btn';
      b.style.background = color;
      if (color === '#ffffff') b.style.border = '1px solid #cbd5e1';
      b.addEventListener('click', () => {
        if (isFill === 0) applyFill(color); else applyStroke(color);
      });
      container.appendChild(b);
    });
  });
}

function applyFill(color) {
  fillColor = color;
  document.getElementById('fill-custom').value = toHex(color);
  if (selected) updateShape(selected, { fill: color });
}
function applyStroke(color) {
  strokeColor = color;
  document.getElementById('stroke-custom').value = toHex(color);
  if (selected) updateShape(selected, { stroke: color });
}

// ── Props panel events ────────────────────────────────────────────────────────
document.getElementById('fill-custom').addEventListener('input', e => applyFill(e.target.value));
document.getElementById('stroke-custom').addEventListener('input', e => applyStroke(e.target.value));
document.getElementById('fill-none').addEventListener('click', () => applyFill('transparent'));
document.getElementById('stroke-none').addEventListener('click', () => applyStroke('none'));
document.getElementById('stroke-width').addEventListener('input', e => {
  strokeWidth = +e.target.value;
  document.getElementById('sw-val').textContent = strokeWidth;
  if (selected) updateShape(selected, { strokeWidth });
});
document.getElementById('font-size').addEventListener('input', e => {
  fontSize = +e.target.value;
  document.getElementById('fs-val').textContent = fontSize;
  if (selected) updateShape(selected, { fontSize });
});
document.getElementById('font-color').addEventListener('input', e => {
  fontColor = e.target.value;
  if (selected) updateShape(selected, { fontColor });
});
document.getElementById('opacity').addEventListener('input', e => {
  opacity = +e.target.value / 100;
  document.getElementById('op-val').textContent = e.target.value;
  if (selected) updateShape(selected, { opacity });
});
document.getElementById('delete-btn').addEventListener('click', () => { if (selected) deleteShape(selected); });
document.getElementById('duplicate-btn').addEventListener('click', () => { if (selected) duplicateShape(selected); });

// ── Tool selection ─────────────────────────────────────────────────────────────
function setTool(t) {
  tool = t;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  updateCursor();
}
function updateCursor() {
  svg.style.cursor = tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair';
}
document.querySelectorAll('.tool-btn').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));

// Flowchart preset clicks — switch to select tool + drop shape at center
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.type;
    const cRect = document.getElementById('canvas-container').getBoundingClientRect();
    const cx = (cRect.width / 2 - panX) / zoom;
    const cy = (cRect.height / 2 - panY) / zoom;
    const def = { rect:160, circle:100, diamond:160, parallelogram:160, cylinder:120, rounded:160, text:160, arrow:100 };
    const dh  = { rect:80,  circle:100, diamond:100, parallelogram:80,  cylinder:100, rounded:60,  text:40,  arrow:0   };
    const w = def[type] || 160, h = dh[type] || 80;
    const overrides = {};
    if (btn.dataset.fill)   overrides.fill   = btn.dataset.fill;
    if (btn.dataset.stroke) overrides.stroke = btn.dataset.stroke;
    if (btn.dataset.rx)     overrides.rx     = +btn.dataset.rx;
    const s = makeShape(type, snap(cx - w/2), snap(cy - h/2), w, h, overrides);
    if (type === 'arrow') { s.x2 = s.x + 100; s.y2 = s.y; }
    addShape(s);
    selectShape(s.id);
    setTool('select');
  });
});

// Zoom controls
document.getElementById('zoom-in').addEventListener('click', () => setZoom(zoom * 1.25));
document.getElementById('zoom-out').addEventListener('click', () => setZoom(zoom / 1.25));
document.getElementById('fit-btn').addEventListener('click', fitCanvas);
document.getElementById('grid-toggle').addEventListener('click', () => {
  showGrid = !showGrid;
  gridBg.style.display = showGrid ? '' : 'none';
});

// ── WebSocket sync ─────────────────────────────────────────────────────────────
function syncOp(op) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'canvas_op', op }));
}

function broadcastCursor(x, y) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'presence', presence: { cursor: { position: 0 }, cursor_xy: { x, y } } }));
}

const USER_COLORS = ['#4285F4','#EA4335','#34A853','#FBBC04','#FF6D00','#7B1FA2','#00BCD4','#E91E63'];
const colorMap = new Map(); let colorIdx = 0;
function getColor(id) { if (!colorMap.has(id)) colorMap.set(id, USER_COLORS[colorIdx++ % USER_COLORS.length]); return colorMap.get(id); }

function renderRemoteCursors(users) {
  const remoteLayer = document.getElementById('remote-cursors');
  remoteLayer.innerHTML = '';
  const avatars = [];
  for (const u of users) {
    if (u.user_id === currentUser?.id?.toString()) continue;
    const color = getColor(u.user_id);
    const initial = (u.name || u.email || '?')[0].toUpperCase();
    avatars.push(`<span class="user-avatar" style="background:${color}" title="${u.email || ''}">${initial}</span>`);
    if (u.cursor_xy) {
      const { x, y } = u.cursor_xy;
      const label = (u.name || u.email || 'User').split('@')[0].slice(0, 10);
      const g2 = el('g');
      g2.appendChild(el('circle', { cx: x, cy: y, r: 5, fill: color }));
      const t = el('text', { x: x+8, y: y-4, 'font-size': 11, fill: 'white',
        style: `background:${color}; font-family:sans-serif` });
      const bg = el('rect', { x: x+6, y: y-16, width: label.length*7+8, height: 16, fill: color, rx: 3 });
      t.textContent = label;
      g2.appendChild(bg); g2.appendChild(t);
      remoteLayer.appendChild(g2);
    }
  }
  document.getElementById('users-bar').innerHTML = avatars.join('');
}

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws/documents/${docId}?token=${getToken()}&last_revision=0`);
  ws.onopen  = () => { setStatus('connected'); reconnectDelay = 1000; };
  ws.onclose = () => { setStatus('reconnecting'); setTimeout(connectWS, reconnectDelay); reconnectDelay = Math.min(reconnectDelay * 2, 15000); };
  ws.onerror = () => setStatus('error');
  ws.onmessage = e => handleWSMessage(JSON.parse(e.data));
  setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'ping' })), 25000);
}

let reconnectDelay = 1000;

function handleWSMessage(msg) {
  switch (msg.type) {
    case 'canvas_op': {
      const op = msg.op;
      if (op.kind === 'add') {
        shapes[op.shape.id] = op.shape;
        reRenderShape(op.shape);
        updateShapeCount();
      } else if (op.kind === 'update') {
        if (shapes[op.id]) {
          Object.assign(shapes[op.id], op.changes);
          reRenderShape(shapes[op.id]);
          if (selected === op.id) { renderSelection(shapes[op.id]); showProps(shapes[op.id]); }
        }
      } else if (op.kind === 'delete') {
        const g = shapesLayer.querySelector(`[data-id="${op.id}"]`);
        if (g) g.remove();
        delete shapes[op.id];
        if (selected === op.id) { selected = null; selLayer.innerHTML = ''; hideProps(); }
        updateShapeCount();
      } else if (op.kind === 'full_sync') {
        shapes = op.shapes || {};
        fullRender();
      }
      break;
    }
    case 'presence':
      renderRemoteCursors(msg.users || []);
      break;
    case 'title_changed':
      document.getElementById('doc-title').value = msg.title;
      document.title = msg.title + ' — CollabDocs';
      break;
    case 'canvas_ack':
      setSaveStatus('saved');
      break;
  }
}

// ── Status helpers ─────────────────────────────────────────────────────────────
function setStatus(state) {
  document.getElementById('status-dot').className = 'status-dot ' + state;
  document.getElementById('status-label').textContent = { connected: 'Connected', reconnecting: 'Reconnecting…', error: 'Disconnected' }[state] || state;
}
let saveTimer;
function setSaveStatus(s) {
  clearTimeout(saveTimer);
  const el2 = document.getElementById('save-status');
  el2.textContent = s === 'saving' ? 'Saving…' : '✓ Saved';
  el2.className = 'save-status ' + s;
  if (s === 'saved') saveTimer = setTimeout(() => el2.textContent = '', 2500);
}

// ── Title sync ────────────────────────────────────────────────────────────────
let titleTimer;
document.getElementById('doc-title').addEventListener('input', e => {
  clearTimeout(titleTimer);
  titleTimer = setTimeout(() => {
    const title = e.target.value.trim();
    if (!title || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'title_change', title }));
    document.title = title + ' — CollabDocs';
  }, 600);
});

// ── Share modal ────────────────────────────────────────────────────────────────
document.getElementById('share-btn').addEventListener('click', async () => {
  try {
    const r = await api.generateShareLink(docId);
    document.getElementById('share-link-input').value = r.url;
    document.getElementById('share-modal').classList.add('open');
  } catch (e) { showToast('Could not generate link: ' + e.message, 'error'); }
});
document.getElementById('copy-link-btn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(document.getElementById('share-link-input').value); document.getElementById('copy-link-btn').textContent = '✓ Copied!'; setTimeout(() => document.getElementById('copy-link-btn').textContent = 'Copy', 2000); } catch {}
});
document.getElementById('close-modal').addEventListener('click', () => document.getElementById('share-modal').classList.remove('open'));
document.getElementById('share-modal').addEventListener('click', e => { if (e.target === document.getElementById('share-modal')) document.getElementById('share-modal').classList.remove('open'); });
document.getElementById('back-btn').addEventListener('click', () => window.location.href = '/dashboard');
document.getElementById('logout-btn').addEventListener('click', logout);

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast toast-${type} show`;
  setTimeout(() => t.classList.remove('show'), 3500);
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try { currentUser = await api.me(); } catch { logout(); return; }

  const params = new URLSearchParams(location.search);
  const inviteToken = params.get('token');
  docId = params.get('doc');

  if (inviteToken && !docId) {
    try { const r = await api.acceptInvite(inviteToken); window.location.href = `/editor?doc=${r.document_id}`; return; }
    catch { showToast('Invalid invite link', 'error'); setTimeout(() => window.location.href = '/dashboard', 2000); return; }
  }
  if (!docId) { window.location.href = '/dashboard'; return; }

  let doc;
  try { doc = await api.getDocument(docId); }
  catch { showToast('Document not found', 'error'); setTimeout(() => window.location.href = '/dashboard', 2000); return; }

  document.getElementById('doc-title').value = doc.title;
  document.title = doc.title + ' — CollabDocs';

  // Load canvas state
  try {
    const state = JSON.parse(doc.content);
    if (state.type === 'canvas' && state.shapes) {
      shapes = typeof state.shapes === 'object' && !Array.isArray(state.shapes)
        ? state.shapes
        : Object.fromEntries((state.shapes || []).map(s => [s.id, s]));
      fullRender();
    }
  } catch { /* new/empty canvas */ }

  buildSwatches();
  hideProps();
  applyViewport();
  setStatus('reconnecting');
  connectWS();
}

init();
