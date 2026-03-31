/** 将日文识别结果拆成可点查的片段；不支持时退回整段。 */
export function segmentJapanese(text: string): string[] {
  const t = text.replace(/\r\n/g, '\n').trim();
  if (!t) return [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seg = new (Intl as any).Segmenter('ja', { granularity: 'word' });
    const parts = [...seg.segment(t)]
      .map((s: { segment: string }) => s.segment)
      .filter((s: string) => s.trim().length > 0);
    if (parts.length > 0) return parts;
  } catch {
    /* Intl.Segmenter unavailable */
  }

  return [t];
}

/** 分词后按出现顺序去重，用于批量查词。 */
export function uniqueSegmentQueries(text: string): string[] {
  const parts = segmentJapanese(text);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of parts) {
    const k = s.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/** 常见助词/活用尾缀，从长到短匹配，用于合并「今日は」→「今日」等查词条目。 */
const LOOKUP_SUFFIXES = [
  'では',
  'には',
  'からは',
  'しても',
  'だって',
  'ちゃ',
  'じゃ',
  'から',
  'まで',
  'より',
  'だけ',
  'ばかり',
  'は',
  'が',
  'を',
  'に',
  'で',
  'と',
  'も',
  'の',
  'へ',
  'や',
  'か',
  'ね',
  'よ',
  'な',
].sort((a, b) => b.length - a.length);

export function lemmaForLookup(token: string): string {
  let t = token.trim();
  if (t.length <= 1) return t;
  for (const suf of LOOKUP_SUFFIXES) {
    if (t.length > suf.length && t.endsWith(suf)) {
      const next = t.slice(0, -suf.length);
      if (next.length >= 1) return next;
    }
  }
  return t;
}

function isAllKatakana(s: string): boolean {
  if (!s) return false;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x30a1 && c <= 0x30ff) continue;
    if (c === 0x30fc) continue; // ー
    if (c === 0x309b || c === 0x309c) continue; // ゛゜
    return false;
  }
  return true;
}

/** 极常见功能词/代词等，查词典收益低 */
const SKIP_LOOKUP_LEMMAS = new Set([
  'する',
  'ない',
  'ある',
  'ます',
  'です',
  'だった',
  'ません',
  'でした',
  'など',
  'これ',
  'それ',
  'あれ',
  'どれ',
  'この',
  'その',
  'あの',
  'どの',
  'ここ',
  'そこ',
  'あそこ',
  'どこ',
  'だから',
  'でも',
  'しか',
  'また',
  'もう',
  'まだ',
  'いる',
  'える',
  'られる',
  'せる',
  'ください',
  'しまう',
]);

/** 是否值得发起词典请求：跳过过短、纯片假名（多为人名/外来语）、常见功能词等。 */
export function shouldLookupLemma(lemma: string): boolean {
  const t = lemma.trim();
  if (t.length < 2) return false;
  if (/^\d+$/.test(t)) return false;
  if (/^[a-zA-Z]+$/.test(t)) return false;
  if (SKIP_LOOKUP_LEMMAS.has(t)) return false;
  if (isAllKatakana(t)) return false;
  return true;
}

/** 分词 → 去后缀词干 → 按顺序去重，供词典查询（每个词干只查一次）。 */
export function uniqueLookupQueries(text: string): string[] {
  const parts = segmentJapanese(text);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of parts) {
    const lemma = lemmaForLookup(s);
    if (!lemma || seen.has(lemma)) continue;
    if (!shouldLookupLemma(lemma)) continue;
    seen.add(lemma);
    out.push(lemma);
  }
  return out;
}
