import type {
  ApiErrorBody,
  Conversation,
  ConversationPage,
  MessagePage,
  Presence,
  User,
} from '../types';

const configuredApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
export const API_BASE = configuredApiUrl.replace(/\/$/, '');
const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL;
export const SOCKET_URL = (configuredSocketUrl || API_BASE.replace(/\/api\/v1$/, '')).replace(/\/$/, '');

let accessToken: string | null = null;
let refreshInFlight: Promise<string> | null = null;
let tokenListener: ((token: string | null) => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  tokenListener?.(token);
}

export function setTokenListener(listener: ((token: string | null) => void) | null) {
  tokenListener = listener;
}

export function getAccessToken() {
  return accessToken;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;
  requestId?: string;
  retryAfter: number | null;

  constructor(status: number, body: ApiErrorBody, retryAfter: number | null = null) {
    super(body.message || 'Something went wrong');
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code || 'UNKNOWN';
    this.details = body.details;
    this.requestId = body.requestId;
    this.retryAfter = retryAfter;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const raw = await response.text();
  if (!raw) return undefined as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as T;
  }
}

export async function refreshAccessToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      setAccessToken(null);
      const body = await parseResponse<{ error?: ApiErrorBody }>(response);
      throw new ApiError(response.status, body?.error || { code: 'UNAUTHENTICATED', message: 'Session expired' }, Number(response.headers.get('Retry-After')) || null);
    }

    const result = await parseResponse<{ accessToken: string }>(response);
    if (!result?.accessToken) {
      setAccessToken(null);
      throw new ApiError(401, { code: 'UNAUTHENTICATED', message: 'Refresh response did not include an access token' });
    }
    setAccessToken(result.accessToken);
    return result.accessToken;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  retry?: boolean;
  signal?: AbortSignal;
  allowStatuses?: number[];
};

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, retry = true, signal, allowStatuses = [] } = options;
  const headers = new Headers({ Accept: 'application/json' });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (auth && accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (response.status === 401 && retry) {
    const maybeError = await parseResponse<{ error?: ApiErrorBody }>(response.clone());
    if (maybeError?.error?.code === 'TOKEN_EXPIRED') {
      await refreshAccessToken();
      return request<T>(path, { ...options, retry: false });
    }
  }

  if (!response.ok && !allowStatuses.includes(response.status)) {
    const bodyResult = await parseResponse<{ error?: ApiErrorBody }>(response);
    throw new ApiError(
      response.status,
      bodyResult?.error || { code: 'HTTP_ERROR', message: `Request failed (${response.status})` },
      Number(response.headers.get('Retry-After')) || null,
    );
  }

  return parseResponse<T>(response);
}

export const api = {
  health: () => request<{ status: string; uptime?: number; instanceId?: string }>('/health', { auth: false, retry: false }),
  ready: () => request<{ status: string; checks?: { postgres: boolean; redis: boolean } }>('/ready', { auth: false, retry: false, allowStatuses: [503] }),

  login: (body: { email: string; password: string }) => request<{ user: User; accessToken: string }>('/auth/login', { method: 'POST', body, auth: false, retry: false }),
  register: (body: { email: string; username: string; password: string; displayName: string }) => request<{ user: User; accessToken: string }>('/auth/register', { method: 'POST', body, auth: false, retry: false }),
  logout: () => request<void>('/auth/logout', { method: 'POST', auth: false, retry: false }),

  me: () => request<User>('/users/me'),
  updateMe: (body: { displayName?: string; avatarUrl?: string | null }) => request<User>('/users/me', { method: 'PATCH', body }),
  searchUsers: (query: string, limit = 10) => request<User[]>(`/users?q=${encodeURIComponent(query)}&limit=${limit}`),
  getUser: (id: string) => request<User>(`/users/${encodeURIComponent(id)}`),
  getPresence: (ids: string[]) => request<{ items: Presence[] }>(`/presence?ids=${encodeURIComponent(ids.join(','))}`),

  getConversations: (limit = 50, cursor?: string | null) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return request<ConversationPage>(`/conversations?${params.toString()}`);
  },
  getConversation: (id: string) => request<Conversation>(`/conversations/${encodeURIComponent(id)}`),
  createDirect: (userId: string) => request<Conversation>('/conversations', { method: 'POST', body: { type: 'DIRECT', userId } }),
  createGroup: (name: string, memberIds: string[]) => request<Conversation>('/conversations', { method: 'POST', body: { type: 'GROUP', name, memberIds } }),
  renameGroup: (id: string, name: string) => request<Conversation>(`/conversations/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name } }),
  addMembers: (id: string, userIds: string[]) => request<Conversation>(`/conversations/${encodeURIComponent(id)}/members`, { method: 'POST', body: { userIds } }),
  removeMember: (id: string, userId: string) => request<void>(`/conversations/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  leaveGroup: (id: string) => request<void>(`/conversations/${encodeURIComponent(id)}/leave`, { method: 'POST' }),

  getMessages: (id: string, params: { limit?: number; beforeSeq?: number; afterSeq?: number } = {}) => {
    const query = new URLSearchParams({ limit: String(params.limit ?? 50) });
    if (params.beforeSeq !== undefined) query.set('beforeSeq', String(params.beforeSeq));
    if (params.afterSeq !== undefined) query.set('afterSeq', String(params.afterSeq));
    return request<MessagePage>(`/conversations/${encodeURIComponent(id)}/messages?${query.toString()}`);
  },
  markReadRest: (id: string, upToSeq: number) => request<void>(`/conversations/${encodeURIComponent(id)}/read`, { method: 'POST', body: { upToSeq } }),
  deleteMessageRest: (id: string) => request<void>(`/messages/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
