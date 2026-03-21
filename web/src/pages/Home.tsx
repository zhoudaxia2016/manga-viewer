import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import { Button } from '@/components/ui/button';

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
      const res = await fetch('/api/manga');
      if (res.ok) {
        const data = await res.json();
        setMangaList(data);
      }
    } catch (err) {
      console.error('Failed to fetch manga list:', err);
    }
  }, []);

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

        setProgress(p => p ? { ...p, currentFile: name } : null);

        const formData = new FormData();
        const blob = new Blob([data as BlobPart]);
        formData.append('file', blob, name);
        formData.append('mangaName', mangaName);
        formData.append('chapterName', chapterName);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || `Failed to upload ${name}`);
        }

        setProgress(p => p ? { ...p, current: i + 1 } : null);
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
      const res = await fetch(`/api/manga/${encodeURIComponent(mangaName)}`, { method: 'DELETE' });
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
    <div className="home">
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal confirm-modal" onClick={e => e.stopPropagation()}>
            <p>Delete "{confirmDelete}"?</p>
              <div className="confirm-buttons">
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => handleDelete(confirmDelete)}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      <div className="header">
        <h1>Manga Viewer</h1>
        <Button onClick={() => setShowUpload(true)}>
          + Upload
        </Button>
      </div>

      {showUpload && (
        <div className="modal-overlay" onClick={() => !uploading && setShowUpload(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Upload Manga (ZIP)</h2>
            {uploading && progress ? (
              <div className="progress-container">
                <p>Uploading {progress.current}/{progress.total}</p>
                <p className="current-file">{progress.currentFile}</p>
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
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
          </div>
        </div>
      )}

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
