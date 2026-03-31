import { useCallback, useRef, useState } from 'react';
import type { CropRect } from '@/lib/cropImageFromImg';

const MIN_SIDE = 12;

interface Props {
  onRegionComplete: (rect: CropRect) => void;
}

export function LookupSelectionLayer({ onRegionComplete }: Props) {
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  const localCoords = useCallback((clientX: number, clientY: number) => {
    const el = layerRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const { x, y } = localCoords(e.clientX, e.clientY);
    startRef.current = { x, y };
    setBox({ x, y, w: 0, h: 0 });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    e.preventDefault();
    const { x, y } = localCoords(e.clientX, e.clientY);
    const x1 = startRef.current.x;
    const y1 = startRef.current.y;
    setBox({
      x: Math.min(x1, x),
      y: Math.min(y1, y),
      w: Math.abs(x - x1),
      h: Math.abs(y - y1),
    });
  };

  const finish = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      const el = layerRef.current;
      if (!start || !el) return;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      const { x, y } = localCoords(e.clientX, e.clientY);
      const x1 = start.x;
      const y1 = start.y;
      const rx = Math.min(x1, x);
      const ry = Math.min(y1, y);
      const rw = Math.abs(x - x1);
      const rh = Math.abs(y - y1);
      startRef.current = null;
      setBox(null);
      if (rw >= MIN_SIDE && rh >= MIN_SIDE) {
        onRegionComplete({ x: rx, y: ry, width: rw, height: rh });
      }
    },
    [localCoords, onRegionComplete],
  );

  return (
    <div
      ref={layerRef}
      role="presentation"
      className="absolute inset-0 z-10 cursor-crosshair bg-black/15 touch-none"
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onClick={(e) => e.stopPropagation()}
    >
      {box && box.w > 0 && (
        <div
          className="pointer-events-none absolute border-2 border-sky-400 bg-sky-500/25"
          style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        />
      )}
    </div>
  );
}
