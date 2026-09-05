// The only place Memories Web talks to the Memories API — never to
// Immich directly (PROJECT.md §6). Attaches the stored session token to
// every request except login itself.
import type {
  AdminUserSummary,
  AlbumSummary,
  AssetLocation,
  CommandType,
  Configuration,
  ConfigInput,
  LoginResponse,
  PairingCompleteResponse,
  TempCredential,
  TvDetail,
  TvSummary,
  User,
} from './types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000';
const TOKEN_STORAGE_KEY = 'memories.token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (res.status === 401) {
    // The token is missing, expired, or otherwise invalid — clear it so
    // the next render falls back to the login screen instead of retrying
    // forever with a dead token.
    clearToken();
    throw new ApiError(401, 'Session expired — please sign in again');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = typeof body?.error === 'string' ? body.error : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<User>('/api/v1/auth/me'),

  listTvs: () => request<TvSummary[]>('/api/v1/tvs'),
  getTv: (id: string) => request<TvDetail>(`/api/v1/tvs/${id}`),
  completePairing: (pairingCode: string, name: string) =>
    request<PairingCompleteResponse>('/api/v1/tvs/pairing/complete', {
      method: 'POST',
      body: JSON.stringify({ pairingCode, name }),
    }),
  renameTv: (id: string, name: string) =>
    request<TvSummary>(`/api/v1/tvs/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  updateConfig: (id: string, body: ConfigInput) =>
    request<Configuration>(`/api/v1/tvs/${id}/config`, { method: 'PUT', body: JSON.stringify(body) }),
  sendCommand: (id: string, type: CommandType) =>
    request(`/api/v1/tvs/${id}/commands`, { method: 'POST', body: JSON.stringify({ type }) }),
  deleteTv: (id: string) => request<void>(`/api/v1/tvs/${id}`, { method: 'DELETE' }),

  listAlbums: () => request<AlbumSummary[]>('/api/v1/albums'),
  getAssetLocation: (tvId: string, assetId: string) =>
    request<AssetLocation>(`/api/v1/tvs/${tvId}/assets/${assetId}/location`),

  // Immich account settings — each user connects/disconnects
  // their own API key; both return the updated User so the caller can
  // refresh auth state without a separate /me round-trip.
  updateImmichKey: (apiKey: string) =>
    request<User>('/api/v1/me/immich', { method: 'PUT', body: JSON.stringify({ apiKey }) }),
  disconnectImmich: () => request<User>('/api/v1/me/immich', { method: 'DELETE' }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<User>('/api/v1/me/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),

  // Admin-only account management (routes/admin.ts) — every call here
  // 403s server-side for a non-admin, this is just the client wrapper.
  adminListUsers: () => request<AdminUserSummary[]>('/api/v1/admin/users'),
  adminCreateUser: (email: string) =>
    request<TempCredential>('/api/v1/admin/users', { method: 'POST', body: JSON.stringify({ email }) }),
  adminResetPassword: (userId: string) =>
    request<TempCredential>(`/api/v1/admin/users/${userId}/reset-password`, { method: 'POST' }),

  // Presentation asset URLs are server-relative (§6) — resolve against
  // the same API base, same pattern as the TV's own resolveAssetUrl.
  resolveAssetUrl: (relativeUrl: string) => `${API_BASE_URL}${relativeUrl}`,
};
