import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onTranslate: () => void;
}

export function ReaderContextMenu({
  open,
  x,
  y,
  onClose,
  onTranslate,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    const pad = 10;
    const w = el?.offsetWidth ?? 160;
    const h = el?.offsetHeight ?? 44;
    setPos({
      left: Math.max(pad, Math.min(x, window.innerWidth - w - pad)),
      top: Math.max(pad, Math.min(y, window.innerHeight - h - pad)),
    });
  }, [open, x, y]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[90]"
        aria-hidden
        onMouseDown={() => onClose()}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label="阅读区菜单"
        className="fixed z-[100] min-w-[140px] rounded-lg border border-neutral-700 bg-black shadow-xl"
        style={{ left: pos.left, top: pos.top }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          role="menuitem"
          className="block w-full rounded-lg px-4 py-2.5 text-left text-sm text-white hover:bg-neutral-800"
          onClick={() => {
            onTranslate();
            onClose();
          }}
        >
          翻译
        </button>
      </div>
    </>,
    document.body,
  );
}
