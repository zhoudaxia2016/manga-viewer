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
import { SelectionOverlay } from '@/components/ocr/SelectionOverlay';
import { VocabButton } from '@/components/ocr/VocabButton';
import { OcrPopup } from '@/components/ocr/OcrPopup';

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
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scrollRef = useRef<HTMLDivElement>(null);
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
    if (showControls) {
      hideTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [showControls]);

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
    setShowControls(prev => !prev);
    if (showControls) {
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

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          setIsSelecting(prev => !prev);
        }
      }
      if (e.key === 'Escape' && isSelecting) {
        setIsSelecting(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSelecting]);

  const handleSelectionComplete = useCallback((imageDataUrl: string) => {
    setIsSelecting(false);
    setSelectedImageUrl(imageDataUrl);
  }, []);

  const handleCancelSelection = useCallback(() => {
    setIsSelecting(false);
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
        className="h-screen overflow-y-auto"
      >
        <div className="pb-20">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
              <div className="w-8 h-8 border-2 border-neutral-100 border-t-transparent rounded-full animate-spin" />
              <span className="text-neutral-500 text-sm">加载中...</span>
            </div>
          ) : (
            images.map((img, idx) => (
              <img
                key={idx}
                src={img}
                alt={`第 ${idx + 1} 页`}
                loading={idx < 2 ? 'eager' : 'lazy'}
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

      <SelectionOverlay
        isActive={isSelecting}
        targetRef={scrollRef}
        onSelectionComplete={handleSelectionComplete}
        onCancel={handleCancelSelection}
      />

      <VocabButton
        onClick={() => setIsSelecting(prev => !prev)}
        isSelecting={isSelecting}
      />

      {selectedImageUrl && (
        <OcrPopup
          imageDataUrl={selectedImageUrl}
          onClose={() => setSelectedImageUrl(null)}
        />
      )}
    </div>
  );
}
