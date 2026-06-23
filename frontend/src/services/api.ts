const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(err.detail ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export { requestJson, API_BASE };
