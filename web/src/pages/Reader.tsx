import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || '';

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
  const navigate = useNavigate();

  useEffect(() => {
    const mangaName = sessionStorage.getItem('mangaName');
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
  }, [navigate]);

  useEffect(() => {
    if (!currentChapter) return;

    const mangaName = sessionStorage.getItem('mangaName');
    if (!mangaName) return;

    fetch(`${API_BASE}/api/manga/${encodeURIComponent(mangaName)}/${encodeURIComponent(currentChapter.id)}/images`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setImages(data.map((img: { url: string }) => img.url));
        }
      })
      .catch(err => console.error('Failed to fetch images:', err));
  }, [currentChapter]);

  if (!manga || !currentChapter) {
    return <div className="reader">Loading...</div>;
  }

  return (
    <div 
      className="reader"
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
      </div>

      <div className="scroll-view">
        {images.map((img, idx) => (
          <img key={idx} src={img} alt={`Page ${idx + 1}`} />
        ))}
      </div>

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
        .header button {
          padding: 8px 16px;
          background: #444;
          border: none;
          color: #fff;
          border-radius: 4px;
          cursor: pointer;
        }
        .title { flex: 1; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .chapter-select { padding: 4px 8px; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px; }
        .scroll-view img {
          display: block;
          max-width: 100%;
          margin: 0 auto;
        }
      `}</style>
    </div>
  );
}
