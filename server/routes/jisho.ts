import { json } from '../lib/cors.ts';
import { translateJishoWordToZh } from '../lib/jishoZhTranslate.ts';

const MAX_KEYWORD_LEN = 80;

export async function handleJisho(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const urlObj = new URL(req.url);
  const keyword = urlObj.searchParams.get('keyword')?.trim() ?? '';
  const lang = urlObj.searchParams.get('lang')?.toLowerCase() ?? 'en';

  if (!keyword) {
    return json({ error: 'missing keyword' }, 400);
  }
  if (keyword.length > MAX_KEYWORD_LEN) {
    return json({ error: 'keyword too long' }, 400);
  }

  try {
    const jishoUrl = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(keyword)}`;
    const r = await fetch(jishoUrl, {
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) {
      return json({ error: 'Jisho upstream error' }, 502);
    }
    const data = (await r.json()) as { data?: unknown[] };
    if (Array.isArray(data.data)) {
      data.data = data.data.slice(0, 1);
    }
    if (lang === 'zh' && data.data?.[0]) {
      await translateJishoWordToZh(data.data[0] as Parameters<typeof translateJishoWordToZh>[0]);
    }
    return json(data, 200);
  } catch (err) {
    console.error('Jisho proxy error:', err);
    return json({ error: 'Jisho proxy failed' }, 500);
  }
}
