import { corsHeaders, json } from '../lib/cors.ts';
import { getKv } from '../lib/kv.ts';

/** 阅读顺序：按文件名自然序（p2 在 p10 前） */
function compareImageFileName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function sortChapterImages(images: { name: string; url: string }[]): { name: string; url: string }[] {
  return [...images].sort((x, y) => compareImageFileName(x.name, y.name));
}

async function getChaptersFromKv(kv: Deno.Kv, mangaName: string): Promise<{ id: string; name: string; images: string[] }[]> {
  const chapters: { id: string; name: string; images: string[] }[] = [];
  
  const iter = kv.list({ prefix: ['manga', mangaName, 'chapters'] });
  for await (const entry of iter) {
    if (entry.key.length === 4 && entry.key[0] === 'manga' && entry.key[1] === mangaName && entry.key[2] === 'chapters') {
      const chapterData = entry.value as { name: string; images: { name: string; url: string }[] };
      const names = chapterData.images.map((i) => i.name);
      names.sort(compareImageFileName);
      chapters.push({
        id: chapterData.name,
        name: chapterData.name,
        images: names,
      });
    }
  }
  
  chapters.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return chapters;
}

function isCoverJpgFileName(name: string): boolean {
  return name.toLowerCase() === 'cover.jpg';
}

/**
 * 列表封面：
 * 1) `漫画名/cover.jpg`（与章节文件夹同级）→ KV `['manga', name, 'cover']`
 * 2) 否则任意章节内 `cover.jpg`（不区分大小写）
 * 3) 否则「第一话」按文件名排序后的首张图
 */
async function getCoverUrlForManga(
  kv: Deno.Kv,
  mangaName: string,
  chapters?: { id: string; name: string; images: string[] }[],
): Promise<string | null> {
  const rootCover = await kv.get(['manga', mangaName, 'cover']);
  if (rootCover.value) {
    const u = (rootCover.value as { url?: string }).url;
    if (u) return u;
  }

  const list = chapters ?? await getChaptersFromKv(kv, mangaName);
  let firstChapterFirstUrl: string | null = null;

  for (const ch of list) {
    const chapter = await kv.get(['manga', mangaName, 'chapters', ch.id]);
    if (!chapter.value) continue;
    const chapterData = chapter.value as { name: string; images: { name: string; url: string }[] };
    const sorted = sortChapterImages(chapterData.images);
    const cover = sorted.find((i) => isCoverJpgFileName(i.name));
    if (cover) return cover.url;
    if (firstChapterFirstUrl === null && sorted.length > 0) {
      firstChapterFirstUrl = sorted[0].url;
    }
  }
  return firstChapterFirstUrl;
}

export async function handleMangaList(req: Request): Promise<Response> {
  try {
    const kv = await getKv();
    const mangaList: { name: string; chapterCount: number; coverUrl: string | null }[] = [];
    
    const iter = kv.list({ prefix: ['manga'] });
    for await (const entry of iter) {
      if (entry.key.length === 2 && entry.key[0] === 'manga') {
        const mangaData = entry.value as { name: string };
        const chapters = await getChaptersFromKv(kv, mangaData.name);
        const coverUrl = await getCoverUrlForManga(kv, mangaData.name, chapters);
        mangaList.push({
          name: mangaData.name,
          chapterCount: chapters.length,
          coverUrl,
        });
      }
    }
    
    mangaList.sort((a, b) => a.name.localeCompare(b.name));
    return json(mangaList);
  } catch (err) {
    console.error('List manga error:', err);
    return json({ error: 'Failed to list manga' }, 500);
  }
}

export async function handleMangaInfo(req: Request, mangaName: string): Promise<Response> {
  try {
    const decodedName = decodeURIComponent(mangaName);
    const kv = await getKv();
    
    const manga = await kv.get(['manga', decodedName]);
    if (!manga.value) {
      return json({ error: 'Manga not found' }, 404);
    }
    
    const chapters = await getChaptersFromKv(kv, decodedName);
    return json({ name: decodedName, chapters });
  } catch (err) {
    console.error('Manga info error:', err);
    return json({ error: 'Failed to get manga info' }, 500);
  }
}

export async function handleChapterImages(req: Request, mangaName: string, chapterId: string): Promise<Response> {
  try {
    const decodedName = decodeURIComponent(mangaName);
    const kv = await getKv();
    
    const chapter = await kv.get(['manga', decodedName, 'chapters', decodeURIComponent(chapterId)]);
    if (!chapter.value) {
      return json({ error: 'Chapter not found' }, 404);
    }
    
    const chapterData = chapter.value as { name: string; images: { name: string; url: string }[] };
    return json(sortChapterImages(chapterData.images));
  } catch (err) {
    console.error('Chapter images error:', err);
    return json({ error: 'Failed to get chapter images' }, 500);
  }
}

export async function handleImageProxy(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url).searchParams.get('url');
    if (!url) {
      return json({ error: 'Missing url parameter' }, 400);
    }

    const response = await fetch(url);
    if (!response.ok) {
      return json({ error: 'Failed to fetch image' }, response.status);
    }

    const imageData = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    return new Response(imageData, {
      status: 200,
      headers: {
        ...corsHeaders,
        'content-type': contentType,
        'cache-control': 'public, max-age=31536000',
      },
    });
  } catch (err) {
    console.error('Image proxy error:', err);
    return json({ error: 'Failed to proxy image' }, 500);
  }
}

export async function handleMangaDelete(req: Request, mangaName: string): Promise<Response> {
  try {
    const decodedName = decodeURIComponent(mangaName);
    const kv = await getKv();
    
    const manga = await kv.get(['manga', decodedName]);
    if (!manga.value) {
      return json({ error: 'Manga not found' }, 404);
    }
    
    if (req.method === 'DELETE') {
      const iter = kv.list({ prefix: ['manga'] });
      const toDelete: Deno.KvKey[] = [];
      for await (const entry of iter) {
        if (entry.key.length >= 2 && entry.key[0] === 'manga' && entry.key[1] === decodedName) {
          toDelete.push(entry.key);
        }
      }
      for (const key of toDelete) {
        await kv.delete(key);
      }
      return json({ success: true });
    }
    
    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('Delete manga error:', err);
    return json({ error: 'Failed to delete manga' }, 500);
  }
}

export async function handleImage(req: Request, mangaName: string, chapterId: string, imagePath: string): Promise<Response> {
  try {
    const decodedName = decodeURIComponent(mangaName);
    const kv = await getKv();
    
    const chapter = await kv.get(['manga', decodedName, 'chapters', decodeURIComponent(chapterId)]);
    if (!chapter.value) {
      return json({ error: 'Chapter not found' }, 404);
    }
    
    const chapterData = chapter.value as { name: string; images: { name: string; url: string }[] };
    const imageName = decodeURIComponent(imagePath);
    const imageData = chapterData.images.find(i => i.name === imageName);
    
    if (!imageData) {
      return json({ error: 'Image not found' }, 404);
    }
    
    return json({ url: imageData.url });
  } catch (err) {
    console.error('Image error:', err);
    return json({ error: 'Failed to get image' }, 500);
  }
}
