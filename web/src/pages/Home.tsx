import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import SparkMD5 from 'spark-md5';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Toast, ToastContainer } from '@/components/ui/toast';
import { API_BASE, isProdApiUrlMissing, PROD_API_URL_HINT } from '@/config';

interface Manga {
  name: string;
  chapterCount: number;
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
    const res = await fetch(url, { method: 'POST', body: formData });
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

export default function Home() {
  const [mangaList, setMangaList] = useState<Manga[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
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
      showToast('Please select a ZIP file', 'error');
      return;
    }

    setUploading(true);
    setProgress({ current: 0, total: 0, currentFile: '' });

    try {
      const zipData = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(zipData);

      const files: { name: string; data: BlobPart; path: string }[] = [];
      const zipFiles = zip.files;

      for (const [path, entry] of Object.entries(zipFiles)) {
        if (entry.dir) continue;
        const parts = path.split('/').filter(Boolean);
        if (parts.length < 3) continue;

        const [mangaName, chapterName, ...fileNameParts] = parts;
        const fileName = fileNameParts.join('/');
        const ext = fileName.toLowerCase();
        if (!ext.endsWith('.jpg') && !ext.endsWith('.jpeg') &&
            !ext.endsWith('.png') && !ext.endsWith('.webp') &&
            !ext.endsWith('.gif')) continue;

        const data = new Uint8Array(await entry.async('arraybuffer')) as unknown as BlobPart;
        files.push({ name: fileName, data, path: `${mangaName}/${chapterName}` });
      }

      if (files.length === 0) {
        throw new Error('No valid images found in ZIP');
      }

      setProgress({ current: 0, total: files.length, currentFile: '' });

      for (let i = 0; i < files.length; i++) {
        const { name, data, path } = files[i];
        const [mangaName, chapterName] = path.split('/');

        setProgress(p =>
          p ? { ...p, current: i + 1, currentFile: name } : null,
        );

        const formData = new FormData();
        const blob = new Blob([data as BlobPart]);
        const md5Hash = SparkMD5.ArrayBuffer.hash(data as ArrayBuffer);
        formData.append('file', blob, name);
        formData.append('mangaName', mangaName);
        formData.append('chapterName', chapterName);
        formData.append('md5Hash', md5Hash);

        const res = await postUploadWithRetry(`${API_BASE}/api/upload`, formData);

        if (!res.ok) {
          let msg = `Failed to upload ${name}`;
          try {
            const error = await res.json();
            if (error.message) msg = error.message;
          } catch {
            if (isUploadRetryable(res.status)) {
              msg = '服务繁忙或限流，请稍后重试';
            }
          }
          throw new Error(msg);
        }

        if (i < files.length - 1) {
          await sleep(UPLOAD_GAP_MS);
        }
      }

      showToast('Upload completed successfully!', 'success');
      setShowUpload(false);
      fetchMangaList();
    } catch (err) {
      console.error('Upload error:', err);
      showToast(err instanceof Error ? err.message : 'Upload failed', 'error');
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
        showToast('Deleted successfully', 'success');
      } else {
        showToast('Failed to delete', 'error');
      }
    } catch (err) {
      console.error('Failed to delete manga:', err);
      showToast('Failed to delete', 'error');
    }
    setConfirmDelete(null);
  }, [showToast]);

  const handleMangaClick = useCallback((manga: Manga) => {
    sessionStorage.setItem('mangaName', manga.name);
    navigate('/reader');
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <ToastContainer>
        {toast && (
          <Toast variant={toast.type === 'error' ? 'destructive' : 'default'}>
            {toast.message}
          </Toast>
        )}
      </ToastContainer>

      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Manga</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{confirmDelete}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleDelete(confirmDelete!)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Manga Viewer</h1>
        <Button onClick={() => setShowUpload(true)}>+ Upload</Button>
      </div>

      <Dialog open={showUpload} onOpenChange={() => !uploading && setShowUpload(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Manga (ZIP)</DialogTitle>
            <DialogDescription>
              Drag and drop a ZIP file containing manga images
            </DialogDescription>
          </DialogHeader>
          {uploading && progress ? (
            <div className="space-y-4 py-4">
              <p className="text-sm">Uploading {progress.current}/{progress.total}</p>
              <Progress value={(progress.current / progress.total) * 100} />
              <p className="text-xs text-muted-foreground truncate">{progress.currentFile}</p>
            </div>
          ) : (
            <div
              className={`drop-zone ${uploading ? 'disabled' : ''}`}
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              <p>Drag & drop ZIP file here</p>
              <p className="hint">or click to select</p>
              <p className="hint">Format: 漫画名/章节名/*.jpg</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <Button
            variant="outline"
            onClick={() => setShowUpload(false)}
            disabled={uploading}
          >
            Cancel
          </Button>
        </DialogContent>
      </Dialog>

      <div className="manga-list">
        {mangaList.map((manga) => (
          <div
            key={manga.name}
            className="manga-card"
            onClick={() => handleMangaClick(manga)}
          >
            <span className="manga-name">{manga.name}</span>
            <span className="manga-chapters">{manga.chapterCount} chapters</span>
            <Button
              size="icon"
              variant="ghost"
              className="delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(manga.name);
              }}
            >
              ×
            </Button>
          </div>
        ))}
        {mangaList.length === 0 && (
          <p className="empty">No manga found</p>
        )}
      </div>

      <style>{`
        .home {
          display: flex;
          flex-direction: column;
          align-items: center;
          min-height: 100vh;
          padding: 20px;
          background: #1a1a1a;
          color: #fff;
        }
        .toast {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          z-index: 200;
          animation: fadeIn 0.2s ease;
        }
        .toast-success { background: #4a9; }
        .toast-error { background: #c44; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          max-width: 500px;
          margin-bottom: 20px;
        }
        .header h1 { margin: 0; }
        .upload-btn {
          padding: 10px 20px;
          background: #4a9;
          border: none;
          border-radius: 6px;
          color: #fff;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }
        .upload-btn:hover { background: #5ab; }
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
        }
        .modal {
          background: #2a2a2a;
          padding: 30px;
          border-radius: 12px;
          width: 90%;
          max-width: 400px;
          text-align: center;
        }
        .confirm-modal { padding: 20px; }
        .confirm-modal p { margin: 0 0 20px; }
        .confirm-buttons {
          display: flex;
          gap: 10px;
          justify-content: center;
        }
        .modal h2 { margin: 0 0 20px; }
        .drop-zone {
          border: 2px dashed #666;
          border-radius: 8px;
          padding: 40px 20px;
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
          margin-bottom: 20px;
        }
        .drop-zone:hover:not(.disabled) {
          border-color: #4a9;
          background: rgba(74, 153, 137, 0.1);
        }
        .drop-zone.disabled { cursor: not-allowed; opacity: 0.6; }
        .drop-zone .hint { color: #888; font-size: 12px; margin: 8px 0 0; }
        .progress-container { margin-bottom: 20px; }
        .progress-container p { margin: 8px 0; }
        .current-file { color: #888; font-size: 12px; word-break: break-all; }
        .progress-bar {
          width: 100%;
          height: 8px;
          background: #444;
          border-radius: 4px;
          overflow: hidden;
          margin-top: 10px;
        }
        .progress-fill {
          height: 100%;
          background: #4a9;
          transition: width 0.2s;
        }
        .cancel-btn {
          padding: 10px 20px;
          background: #444;
          border: none;
          border-radius: 6px;
          color: #fff;
          font-size: 14px;
          cursor: pointer;
        }
        .cancel-btn:hover { background: #555; }
        .delete-confirm-btn {
          padding: 10px 20px;
          background: #c44;
          border: none;
          border-radius: 6px;
          color: #fff;
          font-size: 14px;
          cursor: pointer;
        }
        .delete-confirm-btn:hover { background: #d55; }
        .manga-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
          max-width: 500px;
        }
        .manga-card {
          display: flex;
          align-items: center;
          padding: 16px;
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s;
          position: relative;
        }
        .manga-card:hover { background: #3a3a3a; }
        .manga-name { flex: 1; font-weight: 500; }
        .manga-chapters { color: #888; font-size: 14px; margin-right: 12px; }
        .delete-btn {
          width: 28px; height: 28px;
          background: #444; border: none; border-radius: 4px;
          color: #fff; font-size: 18px; cursor: pointer;
          opacity: 0;
          transition: opacity 0.2s, background 0.2s;
        }
        .manga-card:hover .delete-btn { opacity: 1; }
        .delete-btn:hover { background: #c44; }
        .empty { color: #666; text-align: center; margin-top: 40px; }
      `}</style>
    </div>
  );
}
