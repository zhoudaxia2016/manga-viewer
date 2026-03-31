import { apiFetch, apiUrl } from '@/lib/apiClient';

/** Open in browser (no API); use when Jisho API fails or for comparison. */
export function jishoWebSearchUrl(keyword: string): string {
  return `https://jisho.org/search/${encodeURIComponent(keyword)}`;
}

/** Mazii 日中词典搜索（网页）；路径格式以站点为准，可按需调整。 */
export function maziiWebSearchUrl(keyword: string): string {
  return `https://mazii.net/zh-TW/search/${encodeURIComponent(keyword)}`;
}

export interface JishoJapanese {
  word?: string;
  reading?: string;
}

export interface JishoSense {
  english_definitions: string[];
  parts_of_speech?: string[];
}

export interface JishoWord {
  slug: string;
  is_common?: boolean;
  jlpt?: Array<string | { level?: string }>;
  japanese: JishoJapanese[];
  senses: JishoSense[];
}

export interface JishoSearchResponse {
  data: JishoWord[];
}

export async function searchJisho(
  keyword: string,
  options?: { glossLang?: 'en' | 'zh' },
): Promise<JishoSearchResponse> {
  const gloss = options?.glossLang ?? 'zh';
  const q =
    `?keyword=${encodeURIComponent(keyword)}` +
    (gloss === 'zh' ? '&lang=zh' : '');
  const res = await apiFetch(apiUrl(`/api/jisho${q}`));
  if (!res.ok) {
    throw new Error(`词典请求失败 (${res.status})`);
  }
  return res.json() as Promise<JishoSearchResponse>;
}

export interface MaziiEntry {
  word: string;
  reading?: string;
  gloss: string[];
}

export interface MaziiSearchResponse {
  source?: string;
  entries: MaziiEntry[];
  error?: string;
}

export async function searchMazii(keyword: string): Promise<MaziiSearchResponse> {
  const q = `?keyword=${encodeURIComponent(keyword)}`;
  const res = await apiFetch(apiUrl(`/api/mazii${q}`));
  if (!res.ok) {
    throw new Error(`Mazii 请求失败 (${res.status})`);
  }
  return res.json() as Promise<MaziiSearchResponse>;
}
