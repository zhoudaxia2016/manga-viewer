const ALLOWED_REFERER = 'zhoudaxia2016.github.io';

export default {
  async fetch(request, env) {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const referer = request.headers.get('Referer');
    if (!referer) return new Response('Forbidden', { status: 403 });
    
    let refererHost;
    try {
      refererHost = new URL(referer).hostname;
    } catch {
      return new Response('Forbidden', { status: 403 });
    }
    
    if (refererHost !== ALLOWED_REFERER) {
      return new Response('Forbidden', { status: 403 });
    }

    const pathname = new URL(request.url).pathname;
    const key = pathname.startsWith('/') ? pathname.slice(1) : pathname;

    const r2Url = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`;

    try {
      const response = await fetch(r2Url);
      if (!response.ok) {
        return new Response('Not Found', { status: 404 });
      }

      const contentType = response.headers.get('Content-Type') || 'image/jpeg';
      const imageData = await response.arrayBuffer();

      return new Response(imageData, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000',
        },
      });
    } catch (err) {
      console.error('R2 fetch error:', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};
