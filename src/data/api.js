// ---------------------------------------------------------------------------
// Thin wrapper around fetch() for talking to the backend in ../../backend.
// AuthContext calls setAuthToken() after login/logout; every other request
// (store.js) picks that token up automatically.
// ---------------------------------------------------------------------------
import { API_BASE_URL } from '../config';

let authToken = null;

export function setAuthToken(token) {
  authToken = token;
}

export async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  let body = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const message = (body && body.error) || `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return body;
}

export function apiGet(path) {
  return apiFetch(path, { method: 'GET' });
}

export function apiPost(path, data) {
  const isForm = data instanceof FormData;
  return apiFetch(path, { method: 'POST', body: isForm ? data : JSON.stringify(data) });
}

export function apiPatch(path, data) {
  return apiFetch(path, { method: 'PATCH', body: JSON.stringify(data) });
}

export function apiDelete(path) {
  return apiFetch(path, { method: 'DELETE' });
}
