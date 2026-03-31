import { API_BASE } from '@/config';

/** 依赖 HttpOnly Cookie；跨域时需 API 与前端不同源仍能通过 CORS 回显 Origin（见服务端 corsHeadersFor）。 */
export function apiFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, credentials: 'include' });
}

export function apiUrl(path: string): string {
  const base = API_BASE.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
