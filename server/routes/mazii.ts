import { json } from '../lib/cors.ts';

const MAX_KEYWORD_LEN = 80;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function parseLooseMaziiJson(j: unknown): Array<{ word: string; reading?: string; gloss: string[] }> {
  if (!j || typeof j !== 'object') return [];
  const root = j as Record<string, unknown>;
  const arr = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.words)
    ? root.words
    : Array.isArray(root.results)
    ? root.results
    : Array.isArray(j)
    ? (j as unknown[])
    : [];
  const out: Array<{ word: string; reading?: string; gloss: string[] }> = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const x = item as Record<string, unknown>;
    const word = String(x.word ?? x.w ?? x.title ?? x.kanji ?? '').trim();
    if (!word) continue;
    const reading = x.reading ?? x.phonetic ?? x.hiragana ?? x.kana;
    let gloss: string[] = [];
    if (Array.isArray(x.means)) {
      gloss = x.means.map((m) => String(m));
    } else if (Array.isArray(x.meanings)) {
      gloss = x.meanings.map((m) => String(m));
    } else if (typeof x.mean === 'string') {
      gloss = [x.mean];
    } else if (typeof x.def === 'string') {
      gloss = [x.def];
    }
    out.push({
      word,
      reading: reading ? String(reading) : undefined,
      gloss: gloss.length ? gloss : ['—'],
    });
  }
  return out;
}

export async function handleMazii(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const keyword = new URL(req.url).searchParams.get('keyword')?.trim() ?? '';
  if (!keyword) {
    return json({ error: 'missing keyword' }, 400);
  }
  if (keyword.length > MAX_KEYWORD_LEN) {
    return json({ error: 'keyword too long' }, 400);
  }

  const tryUrls = [
    `https://api.mazii.net/api/javi/search?dict=javi&query=${encodeURIComponent(keyword)}`,
    `https://api.mazii.net/api/javi/search?type=word&query=${encodeURIComponent(keyword)}`,
  ];

  const maziiHeaders = {
    Accept: 'application/json',
    'User-Agent': UA,
    Referer: 'https://mazii.net/',
    Origin: 'https://mazii.net',
    'Accept-Language': 'ja,en-US;q=0.9,zh-CN;q=0.8',
  };

  for (const url of tryUrls) {
    try {
      const r = await fetch(url, {
        headers: maziiHeaders,
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) continue;
      const j = await r.json();
      const parsed = parseLooseMaziiJson(j);
      if (parsed.length > 0) {
        return json({ entries: parsed }, 200);
      }
    } catch {
      /* try next */
    }
  }

  return json({ entries: [], error: '查询失败' }, 200);
}
