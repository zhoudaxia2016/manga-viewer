import { getKv } from './kv.ts';

const LOGIN_HOURLY = 60;

function parseDailyLimit(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback;
  const n = parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function dailyGeneralLimit(): number {
  return parseDailyLimit(Deno.env.get('RATE_LIMIT_GENERAL'), 100);
}

function dailyImportantLimit(): number {
  return parseDailyLimit(Deno.env.get('RATE_LIMIT_IMPORTANT'), 20);
}

function utcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function utcHourKey(): string {
  return new Date().toISOString().slice(0, 13);
}

export function clientIp(req: Request, info: Deno.ServeHandlerInfo): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const xr = req.headers.get('x-real-ip')?.trim();
  if (xr) return xr;
  const addr = info.remoteAddr;
  if (addr && typeof addr === 'object' && 'hostname' in addr) {
    return addr.hostname;
  }
  return 'unknown';
}

async function incrementUnderLimit(
  key: Deno.KvKey,
  limit: number,
  expireMs: number,
): Promise<{ ok: boolean; count: number }> {
  const kv = await getKv();
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await kv.get<number>(key);
    const v = res.value ?? 0;
    if (v >= limit) return { ok: false, count: v };
    const next = v + 1;
    const commit = await kv.atomic().check(res).set(key, next, { expireIn: expireMs }).commit();
    if (commit.ok) return { ok: true, count: next };
  }
  return { ok: false, count: limit };
}

/** 按 IP 计次：清除客户端 Cookie 无法重置匿名配额（避免滥用）。 */
export async function checkDailyRateLimit(
  ip: string,
  tier: 'general' | 'important',
): Promise<{ ok: boolean; limit: number; count: number }> {
  const limit = tier === 'important' ? dailyImportantLimit() : dailyGeneralLimit();
  const key: Deno.KvKey = ['rate', tier, utcDateKey(), 'ip', ip];
  const r = await incrementUnderLimit(key, limit, 48 * 60 * 60 * 1000);
  return { ok: r.ok, limit, count: r.count };
}

export async function checkLoginRateLimit(ip: string): Promise<{ ok: boolean }> {
  const key: Deno.KvKey = ['rate', 'login', utcHourKey(), ip];
  const r = await incrementUnderLimit(key, LOGIN_HOURLY, 2 * 60 * 60 * 1000);
  return { ok: r.ok };
}

export function rateLimitLimits(): { general: number; important: number } {
  return { general: dailyGeneralLimit(), important: dailyImportantLimit() };
}
