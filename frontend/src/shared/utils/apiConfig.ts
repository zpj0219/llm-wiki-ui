import {
  API_ENVIRONMENTS,
  DEFAULT_API_ENVIRONMENT,
  type ApiEnvironment,
} from '@shared/constants';

const API_ENV_STORAGE_KEY = 'apiEnvironment';
const REMOTE_SERVERS_KEY = 'remoteServers';
const SELECTED_SERVER_KEY = 'selectedServerId';

export interface RemoteServer {
  id: string;
  name: string;
  apiBase: string;
  description?: string;
  createdAt: number;
}

export function getCurrentApiEnvironment(): ApiEnvironment {
  const stored = localStorage.getItem(API_ENV_STORAGE_KEY);
  if (stored && stored in API_ENVIRONMENTS) {
    return stored as ApiEnvironment;
  }
  return DEFAULT_API_ENVIRONMENT;
}

export function setApiEnvironment(env: ApiEnvironment): void {
  localStorage.setItem(API_ENV_STORAGE_KEY, env);
}

export function getRemoteServers(): RemoteServer[] {
  try {
    const stored = localStorage.getItem(REMOTE_SERVERS_KEY);
    if (!stored) {
      return [
        {
          id: 'default',
          name: '默认服务器',
          apiBase: 'http://192.168.1.100:8000/api',
          description: '局域网服务器',
          createdAt: Date.now(),
        },
      ];
    }
    return JSON.parse(stored) as RemoteServer[];
  } catch {
    return [];
  }
}

export function saveRemoteServers(servers: RemoteServer[]): void {
  localStorage.setItem(REMOTE_SERVERS_KEY, JSON.stringify(servers));
}

export function addRemoteServer(server: Omit<RemoteServer, 'id' | 'createdAt'>): RemoteServer {
  const servers = getRemoteServers();
  const newServer: RemoteServer = {
    ...server,
    id: `server-${Date.now()}`,
    createdAt: Date.now(),
  };
  servers.push(newServer);
  saveRemoteServers(servers);
  return newServer;
}

export function updateRemoteServer(
  id: string,
  updates: Partial<Omit<RemoteServer, 'id' | 'createdAt'>>
): boolean {
  const servers = getRemoteServers();
  const index = servers.findIndex((s) => s.id === id);
  if (index === -1) return false;
  servers[index] = { ...servers[index], ...updates };
  saveRemoteServers(servers);
  return true;
}

export function deleteRemoteServer(id: string): boolean {
  const servers = getRemoteServers();
  const filtered = servers.filter((s) => s.id !== id);
  if (filtered.length === servers.length) return false;
  saveRemoteServers(filtered);
  if (getSelectedServerId() === id) setSelectedServerId(null);
  return true;
}

export function getSelectedServerId(): string | null {
  return localStorage.getItem(SELECTED_SERVER_KEY);
}

export function setSelectedServerId(id: string | null): void {
  if (id) localStorage.setItem(SELECTED_SERVER_KEY, id);
  else localStorage.removeItem(SELECTED_SERVER_KEY);
}

export function getSelectedServer(): RemoteServer | null {
  const id = getSelectedServerId();
  if (!id) return null;
  return getRemoteServers().find((s) => s.id === id) ?? null;
}

/** Web 版默认走 Vite 代理 /api；生产环境可通过 VITE_API_BASE 覆盖 */
export function getApiBase(): string {
  const envBase = import.meta.env.VITE_API_BASE?.trim();
  if (envBase) return envBase.replace(/\/$/, '');

  const env = getCurrentApiEnvironment();
  if (env === 'REMOTE') {
    const selected = getSelectedServer();
    if (selected) return selected.apiBase.replace(/\/$/, '');
    const servers = getRemoteServers();
    if (servers.length > 0) return servers[0].apiBase.replace(/\/$/, '');
  }
  return API_ENVIRONMENTS[env].apiBase.replace(/\/$/, '');
}

export function getAuthApiBase(): string {
  return getApiBase();
}

export function getLoginEndpoint(): string {
  return `${getApiBase()}/auth/login`;
}

export function getMeEndpoint(): string {
  return `${getApiBase()}/auth/me`;
}

export function getLogoutEndpoint(): string {
  return `${getApiBase()}/auth/logout`;
}
