const DEFAULT_METHODS = 'GET, POST, DELETE, OPTIONS';
const DEFAULT_HEADERS = 'Content-Type';

/**
 * 带 Origin 时回显该源并允许 credentials，便于浏览器携带 Cookie。
 * 无 Origin（如 curl、同页直链）仍用 *。
 */
export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  if (origin) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': DEFAULT_METHODS,
      'Access-Control-Allow-Headers': DEFAULT_HEADERS,
    };
  }
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': DEFAULT_METHODS,
    'Access-Control-Allow-Headers': DEFAULT_HEADERS,
  };
}

export function withCors(res: Response, req: Request): Response {
  const ch = corsHeadersFor(req);
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(ch)) {
    h.set(k, v);
  }
  return new Response(res.body, { status: res.status, headers: h });
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
