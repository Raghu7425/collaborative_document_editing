import { requireAuth, logout } from './auth.js';
import { api } from './api.js';

const token = requireAuth();
let currentUser = null;

async function init() {
  try {
    currentUser = await api.me();
    document.getElementById('user-email').textContent = currentUser.email;
  } catch (e) {
    logout();
    return;
  }
  await loadDocuments();
}

async function loadDocuments() {
  const grid = document.getElementById('doc-grid');
  const empty = document.getElementById('empty-state');
  grid.innerHTML = '<div class="loading-spinner"></div>';
  try {
    const docs = await api.listDocuments();
    grid.innerHTML = '';
    if (docs.length === 0) {
      empty.style.display = 'flex';
      return;
    }
    empty.style.display = 'none';
    docs.forEach(doc => grid.appendChild(makeCard(doc)));
  } catch (e) {
    grid.innerHTML = `<p class="error-msg">Failed to load documents: ${e.message}</p>`;
  }
}

function makeCard(doc) {
  const card = document.createElement('div');
  card.className = 'doc-card';
  const updated = new Date(doc.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const wordCount = doc.content.trim() ? doc.content.trim().split(/\s+/).length : 0;
  card.innerHTML = `
    <div class="doc-card-icon">📄</div>
    <div class="doc-card-body">
      <h3 class="doc-card-title">${escHtml(doc.title)}</h3>
      <p class="doc-card-meta">Rev ${doc.current_revision} · ${wordCount} words · ${updated}</p>
      <p class="doc-card-preview">${escHtml(doc.content.slice(0, 80)) || '<em>No content</em>'}</p>
    </div>
    <div class="doc-card-actions">
      <button class="btn-icon share-btn" title="Copy share link" data-id="${doc.id}">🔗</button>
      <button class="btn-icon delete-btn" title="Delete" data-id="${doc.id}">🗑️</button>
    </div>
  `;
  card.querySelector('.doc-card-body').addEventListener('click', () => {
    window.location.href = `/editor?doc=${doc.id}`;
  });
  card.querySelector('.doc-card-icon').addEventListener('click', () => {
    window.location.href = `/editor?doc=${doc.id}`;
  });
  card.querySelector('.share-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    handleShare(doc.id);
  });
  card.querySelector('.delete-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    handleDelete(doc.id, doc.title);
  });
  return card;
}

async function handleShare(docId) {
  try {
    const result = await api.generateShareLink(docId);
    await navigator.clipboard.writeText(result.url);
    showToast('Share link copied to clipboard!');
  } catch (e) {
    showToast('Failed to generate share link: ' + e.message, 'error');
  }
}

async function handleDelete(docId, title) {
  if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
  try {
    await api.deleteDocument(docId);
    showToast('Document deleted');
    await loadDocuments();
  } catch (e) {
    showToast('Delete failed: ' + e.message, 'error');
  }
}

async function handleNewDocument() {
  const title = prompt('Document title:', 'Untitled Document');
  if (!title) return;
  try {
    const doc = await api.createDocument(title);
    window.location.href = `/editor?doc=${doc.id}`;
  } catch (e) {
    showToast('Failed to create document: ' + e.message, 'error');
  }
}

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast toast-${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

document.getElementById('new-doc-btn').addEventListener('click', handleNewDocument);
document.getElementById('logout-btn').addEventListener('click', logout);

init();
