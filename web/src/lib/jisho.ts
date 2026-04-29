export interface JishoWord {
  slug: string;
  is_common: boolean;
  tags: string[];
  jlpt: string[];
  japanese: {
    word?: string;
    reading: string;
  }[];
  senses: {
    english_definitions: string[];
    parts_of_speech: string[];
    links: { text: string; url: string }[];
    tags: string[];
    restrictions: string[];
    see_also: string[];
    antonyms: string[];
    source: string[];
    info: string[];
  }[];
}

export async function searchJisho(word: string): Promise<JishoWord[]> {
  if (!word) {
    return [];
  }
  const encoded = encodeURIComponent(word);
  const url = `https://api.jisho.org/api/v1/search/words?keyword=${encoded}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error('[searchJisho] HTTP error', res.status, res.statusText);
      return [];
    }
    const json = await res.json();
    const data = (json?.data ?? []) as JishoWord[];
    return data;
  } catch (err) {
    console.error('[searchJisho] Unexpected error', err);
    return [];
  }
}
