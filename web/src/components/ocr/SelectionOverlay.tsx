import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/config';

interface SelectionOverlayProps {
  isActive: boolean;
  targetRef: React.RefObject<HTMLDivElement | null>;
  onSelectionComplete: (imageDataUrl: string) => void;
  onCancel: () => void;
}

interface Point {
  x: number;
  y: number;
}

interface Rect {
  start: Point;
  end: Point;
}

async function fetchImageProxy(imageUrl: string): Promise<string> {
  const proxyUrl = `${API_BASE}/api/image?url=${encodeURIComponent(imageUrl)}`;
  const response = await fetch(proxyUrl);
  if (!response.ok) {
    throw new Error('Failed to fetch image through proxy');
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export function SelectionOverlay({ isActive, targetRef, onSelectionComplete, onCancel }: SelectionOverlayProps) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const getPosition = useCallback((e: MouseEvent | TouchEvent): Point => {
    if (!overlayRef.current) return { x: 0, y: 0 };
    const overlayRect = overlayRef.current.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - overlayRect.left,
        y: e.touches[0].clientY - overlayRect.top,
      };
    }
    return {
      x: e.clientX - overlayRect.left,
      y: e.clientY - overlayRect.top,
    };
  }, []);

  const handleStart = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    const pos = getPosition(e);
    setIsSelecting(true);
    setRect({ start: pos, end: pos });
  }, [getPosition]);

  const handleMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isSelecting || !rect) return;
    e.preventDefault();
    const pos = getPosition(e);
    setRect(prev => prev ? { ...prev, end: pos } : null);
  }, [isSelecting, rect, getPosition]);

  const handleEnd = useCallback(async () => {
    if (!isSelecting || !rect) {
      setIsSelecting(false);
      setRect(null);
      return;
    }

    const minX = Math.min(rect.start.x, rect.end.x);
    const minY = Math.min(rect.start.y, rect.end.y);
    const width = Math.abs(rect.end.x - rect.start.x);
    const height = Math.abs(rect.end.y - rect.start.y);

    if (width < 10 || height < 10) {
      setIsSelecting(false);
      setRect(null);
      return;
    }

    if (!targetRef.current) {
      setIsSelecting(false);
      setRect(null);
      return;
    }

    const imgElements = targetRef.current.querySelectorAll('img');
    let targetImg: HTMLImageElement | null = null;
    for (const img of imgElements) {
      const imgRect = img.getBoundingClientRect();
      if (minX >= imgRect.left && minX <= imgRect.right &&
          minY >= imgRect.top && minY <= imgRect.bottom) {
        targetImg = img;
        break;
      }
    }

    if (!targetImg) {
      setIsSelecting(false);
      setRect(null);
      return;
    }

    try {
      const originalSrc = targetImg.src;
      const sameOriginUrl = await fetchImageProxy(originalSrc);
      
      await new Promise<void>((resolve, reject) => {
        const tempImg = new Image();
        tempImg.onload = () => {
          const imgRect = targetImg!.getBoundingClientRect();
          const scaleX = tempImg.naturalWidth / imgRect.width;
          const scaleY = tempImg.naturalHeight / imgRect.height;
          
          const srcX = (minX - imgRect.left) * scaleX;
          const srcY = (minY - imgRect.top) * scaleY;
          const srcW = width * scaleX;
          const srcH = height * scaleY;
          
          const canvas = document.createElement('canvas');
          canvas.width = srcW;
          canvas.height = srcH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          ctx.drawImage(
            tempImg,
            srcX, srcY, srcW, srcH,
            0, 0, srcW, srcH
          );
          URL.revokeObjectURL(sameOriginUrl);
          
          const dataUrl = canvas.toDataURL('image/png');
          onSelectionComplete(dataUrl);
          resolve();
        };
        tempImg.onerror = () => {
          URL.revokeObjectURL(sameOriginUrl);
          reject(new Error('Failed to load image'));
        };
        tempImg.src = sameOriginUrl;
      });
    } catch (err) {
      console.error('[SelectionOverlay] error:', err);
    }

    setIsSelecting(false);
    setRect(null);
  }, [isSelecting, rect, targetRef, onSelectionComplete]);

  useEffect(() => {
    if (!isActive) return;

    const overlay = overlayRef.current;
    if (!overlay) return;

    const onMouseDown = (e: MouseEvent) => { handleStart(e); };
    const onMouseMove = (e: MouseEvent) => { if (isSelecting) handleMove(e); };
    const onMouseUp = () => { handleEnd(); };

    overlay.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    overlay.addEventListener('touchstart', handleStart as EventListener, { passive: false });
    window.addEventListener('touchmove', handleMove as EventListener, { passive: false });
    window.addEventListener('touchend', handleEnd);

    return () => {
      overlay.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      overlay.removeEventListener('touchstart', handleStart as EventListener);
      window.removeEventListener('touchmove', handleMove as EventListener);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isActive, handleStart, handleMove, handleEnd, isSelecting]);

  if (!isActive) return null;

  const selectionStyle = rect ? {
    left: Math.min(rect.start.x, rect.end.x),
    top: Math.min(rect.start.y, rect.end.y),
    width: Math.abs(rect.end.x - rect.start.x),
    height: Math.abs(rect.end.y - rect.start.y),
  } : null;

  return (
    <div
      ref={overlayRef}
      className={cn(
        'fixed inset-0 z-[100] cursor-crosshair select-none',
        isSelecting ? 'bg-black/20' : 'bg-transparent'
      )}
      onClick={(e) => {
        if (!isSelecting) {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      {/* Instruction text */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-neutral-900/90 text-neutral-100 px-4 py-2 rounded-lg text-sm">
        拖动选择文字区域
      </div>

      {/* Selection rectangle */}
      {selectionStyle && (
        <div
          className="absolute border-2 border-blue-400 bg-blue-400/10 pointer-events-none"
          style={selectionStyle}
        />
      )}

      {/* Corner handles for visual feedback */}
      {selectionStyle && (
        <>
          <div className="absolute w-3 h-3 bg-blue-400 rounded-sm" style={{ left: selectionStyle.left - 2, top: selectionStyle.top - 2 }} />
          <div className="absolute w-3 h-3 bg-blue-400 rounded-sm" style={{ left: selectionStyle.left + selectionStyle.width - 1, top: selectionStyle.top - 2 }} />
          <div className="absolute w-3 h-3 bg-blue-400 rounded-sm" style={{ left: selectionStyle.left - 2, top: selectionStyle.top + selectionStyle.height - 1 }} />
          <div className="absolute w-3 h-3 bg-blue-400 rounded-sm" style={{ left: selectionStyle.left + selectionStyle.width - 1, top: selectionStyle.top + selectionStyle.height - 1 }} />
        </>
      )}
    </div>
  );
}
