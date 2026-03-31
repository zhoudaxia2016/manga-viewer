import { json } from '../lib/cors.ts';
import {
  buildSessionCookie,
  clearSessionCookie,
  createSessionToken,
  getSessionTokenFromRequest,
  isAuthEnabled,
  verifySessionToken,
} from '../lib/session.ts';
import { checkLoginRateLimit, clientIp } from '../lib/rateLimit.ts';

export async function handleAuth(
  req: Request,
  pathname: string,
  info: Deno.ServeHandlerInfo,
): Promise<Response | null> {
  if (!pathname.startsWith('/api/auth/')) return null;

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    if (!isAuthEnabled()) {
      return json({ authenticated: true, authRequired: false });
    }
    const token = getSessionTokenFromRequest(req);
    let valid = false;
    if (token) valid = await verifySessionToken(token);
    return json({ authenticated: valid, authRequired: true });
  }

  if (!isAuthEnabled()) return null;

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': clearSessionCookie(req),
      },
    });
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const ip = clientIp(req, info);
    const rl = await checkLoginRateLimit(ip);
    if (!rl.ok) {
      return json({ error: 'too_many_attempts', message: '登录尝试过多，请稍后再试' }, 429);
    }

    let body: { password?: string };
    try {
      body = (await req.json()) as { password?: string };
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }
    const expected = Deno.env.get('PASSWORD') ?? '';
    const got = typeof body.password === 'string' ? body.password : '';
    if (!got || got !== expected) {
      return json({ error: 'unauthorized', message: '密码错误' }, 401);
    }

    const token = await createSessionToken();
    const cookie = buildSessionCookie(token, 7 * 24 * 60 * 60, req);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie,
      },
    });
  }

  return json({ error: 'Not Found' }, 404);
}
