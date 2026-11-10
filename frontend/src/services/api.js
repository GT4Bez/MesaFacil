const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function api(path, options = {}) {
  const token = localStorage.getItem('mesa-facil-token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  };

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error('Não foi possível conectar ao servidor. Verifique se o backend está ligado e se a URL está correta.');
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text();

  if (!response.ok) {
    const message = typeof data === 'object'
      ? data.message || data.error
      : data;
    if (response.status === 401) throw new Error('E-mail ou senha inválidos, ou sua sessão expirou.');
    if (response.status === 409) throw new Error(message || 'Não foi possível realizar esta ação porque existe uma operação em andamento.');
    throw new Error(message || `Erro ${response.status}. Tente novamente.`);
  }
  return data;
}

export const get = (path) => api(path);
export const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
export const patch = (path, body) => api(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
export const del = (path) => api(path, { method: 'DELETE' });
