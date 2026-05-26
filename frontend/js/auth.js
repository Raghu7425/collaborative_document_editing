// Token management
export function saveToken(token) {
  localStorage.setItem('collab_token', token);
}

export function getToken() {
  return localStorage.getItem('collab_token');
}

export function clearToken() {
  localStorage.removeItem('collab_token');
}

export function requireAuth() {
  const token = getToken();
  if (!token) {
    window.location.href = '/';
    return null;
  }
  return token;
}

export function logout() {
  clearToken();
  window.location.href = '/';
}
