import "dotenv/load.ts";
import { corsHeaders, json } from './lib/cors.ts';
import { handleMangaList, handleMangaInfo, handleChapterImages, handleImage, handleMangaDelete } from './routes/manga.ts';
import { handleUpload } from './routes/upload.ts';
import { getKv } from './lib/kv.ts';

const ROUTES: Record<string, { method: string; handler: (req: Request) => Promise<Response> }> = {
  '/api/manga': { method: 'GET', handler: handleMangaList },
  '/api/upload': { method: 'POST', handler: handleUpload },
};

const PORT = parseInt(Deno.env.get('PORT') ?? '8080', 10);

Deno.serve({ port: PORT }, async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

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

  // 临时路由 - 用完删除
  if (path === "/api/delete-chapter" && req.method === "POST") {
    const kv = await getKv();
    await kv.delete(["manga", "還暦姫", "chapters", "di4hua"]);
    kv.close();
    return json({ success: true, deleted: "di4hua" });
  }

  return json({ error: 'Not Found' }, 404);
});
