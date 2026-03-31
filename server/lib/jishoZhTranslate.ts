/** 将 Jisho 英文释义转为中文（MyMemory 免费接口，有频率限制；失败则保留原文） */

interface JishoSense {
  english_definitions?: string[];
  parts_of_speech?: string[];
}

interface JishoWordLike {
  senses?: JishoSense[];
}

const cache = new Map<string, string>();
const MAX_CACHE = 500;

export async function translateEnToZhLine(en: string): Promise<string> {
  const t = en.trim();
  if (!t) return t;
  if (/[\u4e00-\u9fff]/.test(t) && !/[a-zA-Z]{4,}/.test(t)) return t;
  const hit = cache.get(t);
  if (hit) return hit;
  if (t.length > 480) return t;
  try {
    const url =
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(t)}&langpair=en|zh-CN`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    const j = (await r.json()) as { responseData?: { translatedText?: string } };
    const zh = j.responseData?.translatedText?.trim() ?? t;
    if (cache.size >= MAX_CACHE) cache.clear();
    cache.set(t, zh);
    return zh;
  } catch {
    return t;
  }
}

export async function translateJishoWordToZh(word: JishoWordLike): Promise<void> {
  for (const sense of word.senses ?? []) {
    const defs = sense.english_definitions;
    if (!defs?.length) continue;
    sense.english_definitions = await Promise.all(defs.map((d) => translateEnToZhLine(d)));
  }
}
