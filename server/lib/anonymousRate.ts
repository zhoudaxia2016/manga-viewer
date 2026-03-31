/** 匿名用户按日限流档位；null 表示不限流（未匹配到受保护 API 或非 API）。 */
export function anonymousRateTier(pathname: string, method: string): 'general' | 'important' | null {
  if (pathname === '/api/manga' && method === 'GET') return 'general';
  if ((pathname === '/api/jisho' || pathname === '/api/mazii') && method === 'GET') return 'general';
  if (pathname === '/api/upload' && method === 'POST') return 'important';
  if (pathname === '/api/ocr' && method === 'POST') return 'important';

  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts[1] !== 'manga') return null;

  if (parts.length === 3 && method === 'GET') return 'general';
  if (parts.length === 3 && method === 'DELETE') return 'important';

  if (parts.length === 5 && parts[4] === 'images' && method === 'GET') return 'general';
  // 单张图 302 跳转：不计入「一般 API」配额，避免阅读时每张图都耗次数
  if (parts.length === 6 && parts[4] === 'images' && method === 'GET') return null;

  return null;
}
