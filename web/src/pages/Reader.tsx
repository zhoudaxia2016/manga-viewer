import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE } from '@/config';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { ReaderContextMenu } from '@/components/reader/ReaderContextMenu';
import type { OcrLookupScrollSource } from '@/components/reader/readerAnchors';
import { LookupResultSheet } from '@/components/reader/LookupResultSheet';
import { detectBubbles } from '@/lib/bubbleDetector';
import { cropImageFromImg } from '@/lib/cropImageFromImg';
import { recognizeJapaneseFromBlob } from '@/lib/ocrJapanese';

interface Chapter {
  id: string;
  name: string;
  images: string[];
}

interface MangaInfo {
  name: string;
  chapters: Chapter[];
}

export default function Reader() {
  const [manga, setManga] = useState<MangaInfo | null>(null);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [showControls, setShowControls] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const [contextMenu, setContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    imageIdx: number;
  }>({
    open: false,
    x: 0,
    y: 0,
    imageIdx: -1,
  });
  const [ocrPhase, setOcrPhase] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [ocrText, setOcrText] = useState('');
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupScrollSource, setLookupScrollSource] = useState<OcrLookupScrollSource | null>(null);

  const imageRefs = useRef<(HTMLImageElement | null)[]>([]);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scrollRef = useRef<HTMLDivElement>(null);
  /** state 驱动，保证 OCR 弹窗 portal 首帧即有挂载节点 */
  const [readerScrollContentEl, setReaderScrollContentEl] = useState<HTMLDivElement | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const mangaName = searchParams.get('name');
  const currentChapterIndex = manga?.chapters.findIndex(c => c.id === currentChapter?.id) ?? -1;
  const hasPrevChapter = currentChapterIndex > 0;
  const hasNextChapter = currentChapterIndex < (manga?.chapters.length ?? 0) - 1;

  const resetScroll = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    setCurrentPage(0);
  }, []);

  useEffect(() => {
    if (!mangaName) {
      navigate('/');
      return;
    }

    fetch(`${API_BASE}/api/manga/${encodeURIComponent(mangaName)}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          console.error('Failed to fetch manga:', data.error);
          navigate('/');
          return;
        }
        setManga(data);
        if (data.chapters && data.chapters.length > 0) {
          setCurrentChapter(data.chapters[0]);
        }
      })
      .catch(err => {
        console.error('Failed to fetch manga:', err);
        navigate('/');
      });
  }, [mangaName, navigate]);

  useEffect(() => {
    if (!currentChapter || !mangaName) return;

    setIsLoading(true);
    fetch(`${API_BASE}/api/manga/${encodeURIComponent(mangaName)}/${encodeURIComponent(currentChapter.id)}/images`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setImages(data.map((img: { url: string }) => img.url));
        }
      })
      .catch(err => console.error('Failed to fetch images:', err))
      .finally(() => setIsLoading(false));
  }, [currentChapter, mangaName]);

  useEffect(() => {
    resetScroll();
  }, [currentChapter, resetScroll]);

  const scheduleHideControls = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    hideTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current || images.length === 0) return;

    const { scrollTop, clientHeight } = scrollRef.current;
    const scrollHeight = scrollRef.current.scrollHeight;
    const pageHeight = scrollHeight / images.length;
    const page = Math.floor((scrollTop + clientHeight / 2) / pageHeight);
    setCurrentPage(Math.min(page, images.length - 1));
  }, [images.length]);

  const toggleControls = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (showControls) {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = undefined;
      }
      setShowControls(false);
    } else {
      setShowControls(true);
      scheduleHideControls();
    }
  }, [showControls, scheduleHideControls]);

  const goToPrevChapter = () => {
    if (hasPrevChapter && manga) {
      setCurrentChapter(manga.chapters[currentChapterIndex - 1]);
    }
  };

  const goToNextChapter = () => {
    if (hasNextChapter && manga) {
      setCurrentChapter(manga.chapters[currentChapterIndex + 1]);
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const target = e.target as HTMLElement;
    const imgEl = target.closest('img') as HTMLImageElement | null;
    const imageIdx = imgEl ? parseInt(imgEl.getAttribute('data-idx') ?? '-1', 10) : -1;
    if (!imgEl || imageIdx < 0) return;

    setContextMenu({
      open: true,
      x: e.clientX,
      y: e.clientY,
      imageIdx,
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, open: false }));
  }, []);

  const debugOverlayRef = useRef<HTMLDivElement | null>(null);

  const showDebugRect = useCallback((imgEl: HTMLImageElement, crop: { x: number; y: number; width: number; height: number }) => {
    debugOverlayRef.current?.remove();
    const imgRect = imgEl.getBoundingClientRect();
    const div = document.createElement('div');
    Object.assign(div.style, {
      position: 'fixed',
      left: `${imgRect.left + crop.x}px`,
      top: `${imgRect.top + crop.y}px`,
      width: `${crop.width}px`,
      height: `${crop.height}px`,
      border: '2px solid #ff0',
      background: 'rgba(255,255,0,0.12)',
      pointerEvents: 'none',
      zIndex: '9999',
      transition: 'opacity 0.3s',
    });
    document.body.appendChild(div);
    debugOverlayRef.current = div;
    setTimeout(() => { div.style.opacity = '0'; }, 3000);
    setTimeout(() => { div.remove(); }, 3500);
  }, []);

  const handleLookupOpenChange = useCallback((open: boolean) => {
    setLookupOpen(open);
    if (!open) setLookupScrollSource(null);
  }, []);

  const handleTranslateStart = useCallback(async () => {
    const { x, y, imageIdx } = contextMenu;
    const imgEl = imageRefs.current[imageIdx];
    if (!imgEl) return;

    const rect = imgEl.getBoundingClientRect();
    const clickX = x - rect.left;
    const clickY = y - rect.top;

    const fallbackCrop = () => {
      const cropW = Math.min(300, imgEl.clientWidth * 0.4);
      const cropH = Math.min(250, imgEl.clientHeight * 0.25);
      const cx = Math.max(0, Math.min(clickX - cropW / 2, imgEl.clientWidth - cropW));
      const cy = Math.max(0, Math.min(clickY - cropH / 2, imgEl.clientHeight - cropH));
      return {
        x: cx,
        y: cy,
        width: Math.min(cropW, imgEl.clientWidth - cx),
        height: Math.min(cropH, imgEl.clientHeight - cy),
      };
    };

    if (!imgEl.naturalWidth || !imgEl.clientWidth || !imgEl.naturalHeight || !imgEl.clientHeight) {
      setLookupScrollSource(null);
      setOcrPhase('error');
      setOcrError('图片尚未加载，请稍后重试');
      setLookupOpen(true);
      closeContextMenu();
      return;
    }

    let cropRect: { x: number; y: number; width: number; height: number };
    try {
      const bubble = await detectBubbles(imgEl, clickX, clickY);
      console.debug('[translate] clickX:', clickX, 'clickY:', clickY, '→ bubble:', bubble);
      if (bubble) {
        cropRect = { x: bubble.x, y: bubble.y, width: bubble.width, height: bubble.height };
      } else {
        cropRect = fallbackCrop();
      }
    } catch {
      cropRect = fallbackCrop();
    }

    setLookupScrollSource({
      imageIdx,
      cropDisplay: { ...cropRect },
    });

    setOcrPhase('loading');
    setLookupOpen(true);
    closeContextMenu();

    try {
      console.debug('[translate] cropRect (display):', cropRect);
      showDebugRect(imgEl, cropRect);

      const blob = await cropImageFromImg(imgEl, cropRect);
      console.debug('[translate] crop blob size:', blob.size, 'bytes');
      const text = await recognizeJapaneseFromBlob(blob);
      setOcrText(text);
      setOcrPhase('done');
    } catch (err) {
      setOcrPhase('error');
      setOcrError(err instanceof Error ? err.message : 'OCR 识别失败');
    }
  }, [contextMenu, closeContextMenu, showDebugRect]);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  if (!manga || !currentChapter) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-neutral-100 border-t-transparent rounded-full animate-spin" />
        <span className="text-neutral-400">加载中...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 relative">
      <header
        className={`fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-neutral-900/95 to-neutral-900/60 backdrop-blur-sm border-b border-neutral-800/50 transition-all duration-300 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 max-w-4xl mx-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="text-neutral-300 hover:text-white hover:bg-neutral-800/80"
          >
            ← 返回
          </Button>

          <Select
            value={currentChapter.id}
            onValueChange={(id) => {
              const ch = manga.chapters.find(c => c.id === id);
              if (ch) setCurrentChapter(ch);
            }}
          >
            <SelectTrigger className="w-40 h-9 bg-neutral-800/80 border-neutral-700/50 text-neutral-200 hover:bg-neutral-700/80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-neutral-900 border-neutral-700 text-neutral-200 max-h-80">
              {manga.chapters.map(ch => (
                <SelectItem key={ch.id} value={ch.id} className="hover:bg-neutral-800">
                  {ch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onClick={toggleControls}
        onContextMenu={handleContextMenu}
        className="h-screen overflow-y-auto"
      >
        <div ref={setReaderScrollContentEl} className="relative pb-20">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
              <div className="w-8 h-8 border-2 border-neutral-100 border-t-transparent rounded-full animate-spin" />
              <span className="text-neutral-500 text-sm">加载中...</span>
            </div>
          ) : (
            images.map((img, idx) => (
              <img
                key={idx}
                data-idx={idx}
                ref={el => { imageRefs.current[idx] = el; }}
                src={img}
                alt={`第 ${idx + 1} 页`}
                loading={idx < 2 ? 'eager' : 'lazy'}
                crossOrigin="anonymous"
                className={`block w-full max-w-4xl mx-auto ${idx === 0 ? '' : 'mt-2 pt-4'}`}
              />
            ))
          )}
        </div>
      </div>

      <footer
        className={`fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-neutral-900/95 to-neutral-900/40 backdrop-blur-sm border-t border-neutral-800/50 transition-all duration-300 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 max-w-4xl mx-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); goToPrevChapter(); }}
            disabled={!hasPrevChapter}
            className="text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            上一章
          </Button>

          <Progress
            value={images.length > 0 ? ((currentPage + 1) / images.length) * 100 : 0}
            className="flex-1 h-1 bg-neutral-800 mx-4"
          />
          <p className="text-xs text-neutral-200">
            {currentPage + 1} / {images.length}
          </p>

          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); goToNextChapter(); }}
            disabled={!hasNextChapter}
            className="text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            下一章
          </Button>
        </div>
      </footer>

      <ReaderContextMenu
        open={contextMenu.open}
        x={contextMenu.x}
        y={contextMenu.y}
        onClose={closeContextMenu}
        onTranslate={handleTranslateStart}
      />

      <LookupResultSheet
        open={lookupOpen}
        onOpenChange={handleLookupOpenChange}
        scrollSource={lookupScrollSource}
        scrollContainerRef={scrollRef}
        scrollContentEl={readerScrollContentEl}
        imageRefs={imageRefs}
        ocrPhase={ocrPhase}
        ocrText={ocrText}
        ocrError={ocrError}
      />
    </div>
  );
}
