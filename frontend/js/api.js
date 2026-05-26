import { getToken, clearToken } from './auth.js';

const BASE = '/api/v1';

async function request(method, path, body) {
  const token = getToken();
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  if (res.status === 401) {
    clearToken();
    window.location.href = '/';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  register: (email, password) => request('POST', '/auth/register', { email, password }),
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  me: () => request('GET', '/auth/me'),

  listDocuments: () => request('GET', '/documents'),
  createDocument: (title, content = '') => request('POST', '/documents', { title, content }),
  getDocument: (id) => request('GET', `/documents/${id}`),
  renameDocument: (id, title) => request('PATCH', `/documents/${id}/rename`, { title }),
  deleteDocument: (id) => request('DELETE', `/documents/${id}`),
  generateShareLink: (id) => request('POST', `/documents/${id}/share-link`),
  acceptInvite: (token) => request('POST', `/documents/invite/${token}`),
};
