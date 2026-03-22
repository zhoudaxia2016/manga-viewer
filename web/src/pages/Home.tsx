import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Toast, ToastContainer } from '@/components/ui/toast';
import { API_BASE, isProdApiUrlMissing, PROD_API_URL_HINT } from '@/config';

interface Manga {
  name: string;
  chapterCount: number;
  coverUrl: string | null;
}

interface UploadProgress {
  current: number;
  total: number;
  currentFile: string;
}

interface Toast {
  message: string;
  type: 'success' | 'error';
}

/** 相邻两次上传之间的间隔，减轻 R2 / Deploy / 边缘网关突发限流（可按网络调大） */
const UPLOAD_GAP_MS = Number(import.meta.env.VITE_UPLOAD_GAP_MS) || 400;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 可重试的状态：限流、网关超时、上游暂时不可用 */
function isUploadRetryable(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

async function postUploadWithRetry(url: string, formData: FormData): Promise<Response> {
  const maxAttempts = 6;
  let backoffMs = 1000;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', body: formData });
    } catch (e) {
      if (attempt === maxAttempts - 1) {
        throw e instanceof Error ? e : new Error(String(e));
      }
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, 32_000);
      continue;
    }
    if (res.ok) return res;
    if (!isUploadRetryable(res.status)) return res;
    if (attempt === maxAttempts - 1) return res;
    const ra = res.headers.get('Retry-After');
    const sec = ra ? parseInt(ra, 10) : NaN;
    const wait = Number.isFinite(sec) && sec >= 0 ? sec * 1000 : backoffMs;
    await sleep(wait);
    backoffMs = Math.min(backoffMs * 2, 32_000);
  }
  throw new Error('upload retry exhausted');
}

async function parseUploadErrorResponse(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { message?: string; error?: string };
    if (j.message) return j.message;
    if (j.error) return String(j.error);
  } catch {
    /* ignore */
  }
  return text.trim() || `HTTP ${res.status}`;
}

/** ZIP 内：`漫画名/cover.jpg`（与章节文件夹同级）或 `漫画名/章节名/图` */
type ZipUploadItem =
  | { kind: 'mangaRootCover'; mangaName: string; name: string; data: BlobPart; zipPath: string }
  | {
      kind: 'chapter';
      mangaName: string;
      chapterName: string;
      name: string;
      data: BlobPart;
      zipPath: string;
    };

export default function Home() {
  const [mangaList, setMangaList] = useState<Manga[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [uploadReport, setUploadReport] = useState<{
    okCount: number;
    total: number;
    failed: { path: string; error: string }[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchMangaList = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/manga`);
      if (res.ok) {
        const data = await res.json();
        setMangaList(data);
      }
    } catch (err) {
      console.error('Failed to fetch manga list:', err);
      showToast(
        isProdApiUrlMissing() ? PROD_API_URL_HINT : '无法连接 API（检查地址、HTTPS 与 CORS）',
        'error',
      );
    }
  }, [showToast]);

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      showToast('请选择 ZIP 文件', 'error');
      return;
    }

    setUploading(true);
    setProgress({ current: 0, total: 0, currentFile: '' });

    try {
      const zipData = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(zipData);

      const rootCoverItems: ZipUploadItem[] = [];
      const chapterItems: ZipUploadItem[] = [];
      const zipFiles = zip.files;

      for (const [path, entry] of Object.entries(zipFiles)) {
        if (entry.dir) continue;
        const normPath = path.replace(/\\/g, '/');
        const parts = normPath.split('/').filter(Boolean);

        if (parts.length === 2) {
          const [mangaName, fileName] = parts;
          if (fileName.toLowerCase() !== 'cover.jpg') continue;
          const data = new Uint8Array(await entry.async('arraybuffer')) as unknown as BlobPart;
          rootCoverItems.push({
            kind: 'mangaRootCover',
            mangaName,
            name: 'cover.jpg',
            data,
            zipPath: `${mangaName}/cover.jpg`,
          });
          continue;
        }

        if (parts.length < 3) continue;

        const [mangaName, chapterName, ...fileNameParts] = parts;
        const fileName = fileNameParts.join('/');
        const ext = fileName.toLowerCase();
        if (!ext.endsWith('.jpg') && !ext.endsWith('.jpeg') &&
            !ext.endsWith('.png') && !ext.endsWith('.webp') &&
            !ext.endsWith('.gif')) continue;

        const data = new Uint8Array(await entry.async('arraybuffer')) as unknown as BlobPart;
        chapterItems.push({
          kind: 'chapter',
          mangaName,
          chapterName,
          name: fileName,
          data,
          zipPath: `${mangaName}/${chapterName}/${fileName}`,
        });
      }

      chapterItems.sort((a, b) =>
        a.zipPath.localeCompare(b.zipPath, undefined, { numeric: true, sensitivity: 'base' }),
      );

      const files: ZipUploadItem[] = [...rootCoverItems, ...chapterItems];

      if (files.length === 0) {
        throw new Error('No valid images found in ZIP');
      }

      setProgress({ current: 0, total: files.length, currentFile: '' });

      const failed: { path: string; error: string }[] = [];

      for (let i = 0; i < files.length; i++) {
        const item = files[i];
        const zipPath = item.zipPath;

        setProgress(p =>
          p ? { ...p, current: i + 1, currentFile: item.name } : null,
        );

        const formData = new FormData();
        const blob = new Blob([item.data as BlobPart]);
        formData.append('file', blob, item.name);
        formData.append('mangaName', item.mangaName);
        if (item.kind === 'mangaRootCover') {
          formData.append('mangaRootCover', '1');
        } else {
          formData.append('chapterName', item.chapterName);
        }

        try {
          const res = await postUploadWithRetry(`${API_BASE}/api/upload`, formData);
          if (!res.ok) {
            const msg = await parseUploadErrorResponse(res);
            failed.push({
              path: zipPath,
              error: isUploadRetryable(res.status) ? `${msg} (可稍后仅重传 ZIP 中对应文件)` : msg,
            });
          }
        } catch (e) {
          failed.push({
            path: zipPath,
            error: e instanceof Error ? e.message : String(e),
          });
        }

        if (i < files.length - 1) {
          await sleep(UPLOAD_GAP_MS);
        }
      }

      const okCount = files.length - failed.length;
      setShowUpload(false);
      fetchMangaList();

      if (failed.length === 0) {
        showToast('上传成功', 'success');
      } else {
        setUploadReport({ okCount, total: files.length, failed });
        showToast(
          `上传结束：成功 ${okCount}/${files.length}，失败 ${failed.length} 张（见详情）`,
          'error',
        );
      }
    } catch (err) {
      console.error('Upload error:', err);
      showToast(err instanceof Error ? err.message : '上传失败', 'error');
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }, [fetchMangaList, showToast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const fileInput = fileInputRef.current;
      if (fileInput) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
        const event = new Event('change', { bubbles: true });
        fileInput.dispatchEvent(event);
      }
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  useEffect(() => {
    fetchMangaList();
  }, [fetchMangaList]);

  const handleDelete = useCallback(async (mangaName: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/manga/${encodeURIComponent(mangaName)}`, { method: 'DELETE' });
      if (res.ok) {
        setMangaList(prev => prev.filter(m => m.name !== mangaName));
        showToast('删除成功', 'success');
      } else {
        showToast('删除失败', 'error');
      }
    } catch (err) {
      console.error('Failed to delete manga:', err);
      showToast('Failed to delete', 'error');
    }
    setConfirmDelete(null);
  }, [showToast]);

  const handleMangaClick = useCallback((manga: Manga) => {
    navigate(`/reader?name=${encodeURIComponent(manga.name)}`);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <ToastContainer>
        {toast && (
          <Toast variant={toast.type === 'error' ? 'destructive' : 'default'}>
            {toast.message}
          </Toast>
        )}
      </ToastContainer>

      <Dialog open={!!uploadReport} onOpenChange={() => setUploadReport(null)}>
        <DialogContent className="max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>部分图片未上传成功</DialogTitle>
            <DialogDescription>
              成功 {uploadReport?.okCount ?? 0} / {uploadReport?.total ?? 0}
              。下列路径可对照 ZIP 内结构重传或稍后重试。
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto text-sm font-mono space-y-2 pr-2 max-h-[50vh]">
            {uploadReport?.failed.map((f) => (
              <div key={f.path} className="border-b border-zinc-200 pb-2 last:border-0">
                <div className="break-all text-zinc-900">{f.path}</div>
                <div className="mt-1 text-xs text-zinc-500">{f.error}</div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setUploadReport(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="gap-0 sm:max-w-md">
          <DialogHeader className="space-y-1.5 pb-4">
            <DialogTitle>删除漫画</DialogTitle>
            <DialogDescription>
              确定要删除 "{confirmDelete}" 吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 border-t border-zinc-100 pt-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg border-zinc-200 bg-white text-zinc-700 shadow-none hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-zinc-400"
              onClick={() => setConfirmDelete(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-9 rounded-lg border-0 bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-500"
              onClick={() => handleDelete(confirmDelete!)}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mx-auto mb-8 flex max-w-[1400px] items-center justify-between px-4 pt-6 sm:px-6 sm:pt-8">
        <h1 className="text-2xl font-bold text-zinc-900">漫画阅读器</h1>
        <Button
          type="button"
          className="rounded-lg border-0 bg-zinc-900 px-5 font-medium text-white shadow-sm hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
          onClick={() => setShowUpload(true)}
        >
          + 上传
        </Button>
      </div>

      <Dialog open={showUpload} onOpenChange={() => !uploading && setShowUpload(false)}>
        <DialogContent className="gap-0 sm:max-w-md">
          <DialogHeader className="space-y-1.5 pb-4">
            <DialogTitle>上传漫画（ZIP）</DialogTitle>
            <DialogDescription>
              章节图为「漫画名/章节名/图片」。封面可放「漫画名/cover.jpg」（与章节文件夹同级）；也可放在某一章目录内。
            </DialogDescription>
          </DialogHeader>
          {uploading && progress ? (
            <div className="space-y-3 pb-4">
              <p className="text-sm text-zinc-700">
                上传中 {progress.current}/{progress.total}
              </p>
              <Progress value={(progress.current / progress.total) * 100} />
              <p className="truncate text-xs text-zinc-500">{progress.currentFile}</p>
            </div>
          ) : (
            <div
              className={`rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50/50 px-6 py-10 text-center transition-colors hover:border-zinc-400 hover:bg-zinc-50 ${uploading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              <p className="font-medium text-zinc-800">拖放 ZIP 到此处</p>
              <p className="mt-2 text-sm text-zinc-500">或点击选择文件</p>
              <p className="mt-3 text-xs leading-relaxed text-zinc-400">
                示例：我的漫画/cover.jpg · 我的漫画/第1话/001.jpg
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <DialogFooter className="gap-2 border-t border-zinc-100 pt-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg border-zinc-200 bg-white text-zinc-700 shadow-none hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-zinc-400"
              onClick={() => setShowUpload(false)}
              disabled={uploading}
            >
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 sm:px-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {mangaList.map((manga) => (
            <div key={manga.name} className="group w-full">
              <div
                className="cursor-pointer"
                onClick={() => handleMangaClick(manga)}
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 shadow-sm transition-shadow group-hover:shadow-md">
                  {manga.coverUrl ? (
                    <img
                      src={manga.coverUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-2 text-center text-xs text-zinc-400">
                      {manga.name}
                    </div>
                  )}
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute right-1 top-1 z-10 h-7 w-7 rounded-full opacity-0 shadow-md transition-opacity group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(manga.name);
                    }}
                    aria-label="Delete"
                  >
                    ×
                  </Button>
                </div>
                <p className="mt-2 line-clamp-2 text-center text-sm font-medium text-zinc-900">
                  {manga.name}
                </p>
                <p className="text-center text-xs text-zinc-500">{manga.chapterCount} 章</p>
              </div>
            </div>
          ))}
        </div>
        {mangaList.length === 0 && (
          <p className="mt-16 text-center text-zinc-400">暂无漫画</p>
        )}
      </div>
    </div>
  );
}
