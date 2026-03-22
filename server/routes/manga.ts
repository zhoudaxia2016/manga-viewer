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

export async function handleMangaList(req: Request): Promise<Response> {
  try {
    const kv = await getKv();
    const mangaList: { name: string; chapterCount: number }[] = [];
    
    const iter = kv.list({ prefix: ['manga'] });
    for await (const entry of iter) {
      if (entry.key.length === 2 && entry.key[0] === 'manga') {
        const mangaData = entry.value as { name: string };
        const chapters = await getChaptersFromKv(kv, mangaData.name);
        mangaList.push({
          name: mangaData.name,
          chapterCount: chapters.length,
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
