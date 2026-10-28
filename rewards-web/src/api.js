const BASE = import.meta.env.VITE_REWARDS_API_URL || 'http://localhost:4100';

let csrf = '';

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function readResponse(response) {
  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();

  return { error: await response.text() };
}

function notifyExpiredSession(response) {
  if (response.status === 401) {
    window.dispatchEvent(new Event('rewards:unauthorized'));
  }
}

export async function api(path, { method = 'GET', body, signal, headers = {} } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    signal,
    headers: {
      'content-type': 'application/json',
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await readResponse(response);

  if (!response.ok) {
    notifyExpiredSession(response);
    throw new ApiError(data?.error || 'No se pudo completar la operación', response.status, data);
  }

  if (data?.csrfToken) csrf = data.csrfToken;
  return data;
}

export async function upload(path, file) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'x-original-filename': file.name,
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
    },
    body: await file.arrayBuffer(),
  });
  const data = await readResponse(response);

  if (!response.ok) {
    notifyExpiredSession(response);
    throw new ApiError(data?.error || 'No se pudo revisar el archivo', response.status, data);
  }

  return data;
}

export function clearApiSession() {
  csrf = '';
}
