import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

type ViewMode = 'single' | 'double' | 'scroll';

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
  const [currentPage, setCurrentPage] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('single');
  const [showControls, setShowControls] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const mangaName = sessionStorage.getItem('mangaName');
    if (!mangaName) {
      navigate('/');
      return;
    }

    fetch(`/api/manga/${encodeURIComponent(mangaName)}`)
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
  }, [navigate]);

  useEffect(() => {
    if (!currentChapter) return;

    const mangaName = sessionStorage.getItem('mangaName');
    if (!mangaName) return;

    fetch(`/api/manga/${encodeURIComponent(mangaName)}/${encodeURIComponent(currentChapter.id)}/images`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setImages(data.map((img: { url: string }) => img.url));
        }
      })
      .catch(err => console.error('Failed to fetch images:', err));
  }, [currentChapter]);

  const goToPage = useCallback((page: number) => {
    const newPage = Math.max(0, Math.min(page, images.length - 1));
    setCurrentPage(newPage);
  }, [images]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowLeft':
        goToPage(currentPage - 1);
        break;
      case 'ArrowRight':
        goToPage(currentPage + 1);
        break;
      case 'Home':
        goToPage(0);
        break;
      case 'End':
        goToPage(images.length - 1);
        break;
    }
  }, [currentPage, goToPage, images]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!manga || !currentChapter) {
    return <div className="reader">Loading...</div>;
  }

  return (
    <div 
      className="reader"
      ref={containerRef}
      onClick={() => setShowControls(!showControls)}
    >
      <div className={`header ${showControls ? 'visible' : 'hidden'}`}>
        <button onClick={() => navigate('/')}>← Back</button>
        <span className="title">{manga.name}</span>
        <select 
          value={currentChapter.id}
          onChange={(e) => {
            const ch = manga.chapters.find(c => c.id === e.target.value);
            if (ch) setCurrentChapter(ch);
          }}
          onClick={(e) => e.stopPropagation()}
          className="chapter-select"
        >
          {manga.chapters.map(ch => (
            <option key={ch.id} value={ch.id}>{ch.name}</option>
          ))}
        </select>
        <span className="page-info">{currentPage + 1} / {images.length}</span>
      </div>

      <div className={`controls ${showControls ? 'visible' : 'hidden'}`}>
        <select 
          value={viewMode} 
          onChange={(e) => setViewMode(e.target.value as ViewMode)}
          onClick={(e) => e.stopPropagation()}
        >
          <option value="single">Single Page</option>
          <option value="double">Double Page</option>
          <option value="scroll">Scroll</option>
        </select>
      </div>

      <div className={`image-container ${viewMode}`}>
        {viewMode === 'single' && images[currentPage] && (
          <img 
            src={images[currentPage]} 
            alt={`Page ${currentPage + 1}`}
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              if (clickX < rect.width / 2) {
                goToPage(currentPage - 1);
              } else {
                goToPage(currentPage + 1);
              }
            }}
          />
        )}

        {viewMode === 'double' && (
          <div className="double-pages">
            {images[currentPage] && (
              <img src={images[currentPage]} alt={`Page ${currentPage + 1}`} />
            )}
            {images[currentPage + 1] && (
              <img src={images[currentPage + 1]} alt={`Page ${currentPage + 2}`} />
            )}
            <button 
              className="nav-btn prev"
              onClick={(e) => { e.stopPropagation(); goToPage(currentPage - 2); }}
            >
              ←
            </button>
            <button 
              className="nav-btn next"
              onClick={(e) => { e.stopPropagation(); goToPage(currentPage + 2); }}
            >
              →
            </button>
          </div>
        )}

        {viewMode === 'scroll' && (
          <div className="scroll-view">
            {images.map((img, idx) => (
              <img key={idx} src={img} alt={`Page ${idx + 1}`} />
            ))}
          </div>
        )}
      </div>

      {viewMode !== 'scroll' && (
        <div className={`page-nav ${showControls ? 'visible' : 'hidden'}`}>
          <button 
            disabled={currentPage === 0}
            onClick={(e) => { e.stopPropagation(); goToPage(currentPage - 1); }}
          >
            ← Prev
          </button>
          <input
            type="range"
            min={0}
            max={images.length - 1}
            value={currentPage}
            onChange={(e) => goToPage(Number(e.target.value))}
            onClick={(e) => e.stopPropagation()}
          />
          <button 
            disabled={currentPage >= images.length - 1}
            onClick={(e) => { e.stopPropagation(); goToPage(currentPage + 1); }}
          >
            Next →
          </button>
        </div>
      )}

      <style>{`
        .reader {
          background: #1a1a1a;
          min-height: 100vh;
          color: #fff;
          position: relative;
        }
        .header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          background: rgba(0,0,0,0.8);
          z-index: 100;
          transition: transform 0.3s;
          gap: 12px;
        }
        .header.hidden { transform: translateY(-100%); }
        .header.visible { transform: translateY(0); }
        .title { flex: 1; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .chapter-select { padding: 4px 8px; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px; }
        .page-info { color: #999; white-space: nowrap; }
        .controls {
          position: fixed;
          top: 60px;
          right: 20px;
          z-index: 100;
          transition: opacity 0.3s;
        }
        .controls.hidden { opacity: 0; pointer-events: none; }
        .controls select {
          padding: 8px 12px;
          background: #333;
          color: #fff;
          border: 1px solid #555;
          border-radius: 4px;
        }
        .image-container {
          display: flex;
          justify-content: center;
        }
        .image-container.single img {
          max-width: 100%;
          max-height: 100vh;
        }
        .image-container.double .double-pages {
          display: flex;
          position: relative;
        }
        .image-container.double img {
          max-height: 100vh;
        }
        .image-container.scroll .scroll-view img {
          display: block;
          max-width: 100%;
        }
        .nav-btn {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          padding: 20px 10px;
          background: rgba(0,0,0,0.5);
          border: none;
          color: #fff;
          cursor: pointer;
        }
        .nav-btn.prev { left: 0; }
        .nav-btn.next { right: 0; }
        .page-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 20px;
          background: rgba(0,0,0,0.8);
          z-index: 100;
          transition: transform 0.3s;
        }
        .page-nav.hidden { transform: translateY(100%); }
        .page-nav.visible { transform: translateY(0); }
        .page-nav input[type="range"] { flex: 1; }
        .page-nav button {
          padding: 8px 16px;
          background: #444;
          border: none;
          color: #fff;
          border-radius: 4px;
          cursor: pointer;
        }
        .page-nav button:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
