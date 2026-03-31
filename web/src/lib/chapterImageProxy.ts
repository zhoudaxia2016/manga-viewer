import { API_BASE } from '@/config';

export function chapterImageProxyUrl(
  mangaName: string,
  chapterId: string,
  imageName: string,
): string {
  const base = API_BASE.replace(/\/$/, '');
  const path = `/api/manga/${encodeURIComponent(mangaName)}/${encodeURIComponent(chapterId)}/image-proxy/${encodeURIComponent(imageName)}`;
  return base ? `${base}${path}` : path;
}
