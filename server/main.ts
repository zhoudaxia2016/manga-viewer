import 'dotenv/load.ts';
import { anonymousRateTier } from './lib/anonymousRate.ts';
import { json, withCors } from './lib/cors.ts';
import { checkDailyRateLimit, clientIp, rateLimitLimits } from './lib/rateLimit.ts';
import { isAuthEnabled, isAuthenticated } from './lib/session.ts';
import { handleAuth } from './routes/auth.ts';
import { handleMangaList, handleMangaInfo, handleChapterImages, handleImage, handleMangaDelete } from './routes/manga.ts';
import { handleUpload } from './routes/upload.ts';
import { handleOcr } from './routes/ocr.ts';
import { handleJisho } from './routes/jisho.ts';
import { handleMazii } from './routes/mazii.ts';

const ROUTES: Record<string, { method: string; handler: (req: Request) => Promise<Response> }> = {
  '/api/manga': { method: 'GET', handler: handleMangaList },
  '/api/upload': { method: 'POST', handler: handleUpload },
  '/api/ocr': { method: 'POST', handler: handleOcr },
  '/api/jisho': { method: 'GET', handler: handleJisho },
  '/api/mazii': { method: 'GET', handler: handleMazii },
};

const PORT = parseInt(Deno.env.get('PORT') ?? '8080', 10);

async function dispatch(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname;

  if (path === '/') {
    return json({
      service: 'Manga Viewer API',
      routes: Object.keys(ROUTES).map((p) => ({
        path: p,
        method: ROUTES[p].method,
      })),
    });
  }

  const route = ROUTES[path];
  if (route && req.method === route.method) {
    return route.handler(req);
  }

  if (path.startsWith('/api/manga/')) {
    const parts = path.split('/').filter(Boolean);
    if (parts.length >= 3 && parts[0] === 'api' && parts[1] === 'manga') {
      const [, , mangaName, chapterId, images, ...rest] = parts;
      if (chapterId && images === 'images' && rest.length === 1) {
        const imgResp = await handleImage(req, mangaName, chapterId, rest[0]);
        if (imgResp.status === 200) {
          const data = await imgResp.json();
          return Response.redirect(data.url, 302);
        }
        return imgResp;
      }
      if (chapterId && images === 'images' && !chapterId.includes('.')) {
        return handleChapterImages(req, mangaName, chapterId);
      }
      if (req.method === 'DELETE' && parts.length === 3) {
        return handleMangaDelete(req, mangaName);
      }
      if (parts.length === 3 && !images) {
        return handleMangaInfo(req, mangaName);
      }
    }
  }

  return json({ error: 'Not Found' }, 404);
}

Deno.serve({ port: PORT }, async (req, info) => {
  if (req.method === 'OPTIONS') {
    return withCors(new Response(null, { status: 204 }), req);
  }

  const path = new URL(req.url).pathname;

  const authRes = await handleAuth(req, path, info);
  if (authRes) {
    return withCors(authRes, req);
  }

  if (isAuthEnabled()) {
    const authed = await isAuthenticated(req);
    if (!authed) {
      const tier = anonymousRateTier(path, req.method);
      if (tier) {
        const ip = clientIp(req, info);
        const rl = await checkDailyRateLimit(ip, tier);
        if (!rl.ok) {
          const limits = rateLimitLimits();
          const limit = tier === 'general' ? limits.general : limits.important;
          return withCors(
            json(
              {
                error: 'rate_limited',
                tier,
                limit,
                message:
                  tier === 'general'
                    ? `匿名用户每日一般 API 上限 ${limits.general} 次（按 IP 计），登录后不限次数。`
                    : `匿名用户每日重要 API（上传、OCR、删除等）上限 ${limits.important} 次（按 IP 计），登录后不限次数。`,
              },
              429,
            ),
            req,
          );
        }
      }
    }
  }

  const res = await dispatch(req);
  return withCors(res, req);
});
