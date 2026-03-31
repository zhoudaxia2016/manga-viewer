const COOKIE_NAME = 'mv_session';
const encoder = new TextEncoder();

function base64urlEncodeU8(u8: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(s: string): Uint8Array {
  let b = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  const bin = atob(b);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function getPassword(): string | null {
  return Deno.env.get('PASSWORD')?.trim() || null;
}

export function isAuthEnabled(): boolean {
  return !!getPassword();
}

export async function createSessionToken(): Promise<string> {
  const secret = getPassword();
  if (!secret) throw new Error('auth not configured');
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = JSON.stringify({ exp, v: 1 });
  const payloadU8 = encoder.encode(payload);
  const payloadB64 = base64urlEncodeU8(payloadU8);
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  return `${payloadB64}.${base64urlEncodeU8(new Uint8Array(sig))}`;
}

export async function verifySessionToken(token: string): Promise<boolean> {
  const secret = getPassword();
  if (!secret) return false;
  const i = token.lastIndexOf('.');
  if (i <= 0) return false;
  const payloadB64 = token.slice(0, i);
  const sigB64 = token.slice(i + 1);
  let sig: Uint8Array;
  try {
    sig = base64urlDecode(sigB64);
  } catch {
    return false;
  }
  const key = await hmacKey(secret);
  let ok: boolean;
  try {
    ok = await crypto.subtle.verify('HMAC', key, sig, encoder.encode(payloadB64));
  } catch {
    return false;
  }
  if (!ok) return false;
  let payload: { exp?: number };
  try {
    const json = new TextDecoder().decode(base64urlDecode(payloadB64));
    payload = JSON.parse(json) as { exp?: number };
  } catch {
    return false;
  }
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return false;
  return true;
}

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join('=').trim());
  }
  return out;
}

/** 仅 Cookie（与 express-session 用法一致，跨站请求需 SameSite=None + Secure）。 */
export function getSessionTokenFromRequest(req: Request): string | null {
  const cookies = parseCookies(req.headers.get('Cookie'));
  const c = cookies[COOKIE_NAME];
  return c?.trim() || null;
}

function isSecureRequest(req: Request): boolean {
  const url = new URL(req.url);
  if (url.protocol === 'https:') return true;
  const xf = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  return xf === 'https';
}

export async function isAuthenticated(req: Request): Promise<boolean> {
  if (!isAuthEnabled()) return true;
  const token = getSessionTokenFromRequest(req);
  if (!token) return false;
  return verifySessionToken(token);
}

export function buildSessionCookie(token: string, maxAgeSec: number, req: Request): string {
  const secure = isSecureRequest(req);
  const sameSite = secure ? 'None' : 'Lax';
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSec}`,
    `SameSite=${sameSite}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(req: Request): string {
  const secure = isSecureRequest(req);
  const sameSite = secure ? 'None' : 'Lax';
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    `SameSite=${sameSite}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
