import { useCallback, useRef, useState } from 'react';
import { recognizeJapaneseFromBlob } from '@/lib/ocrJapanese';
import { cropImageFromImg, type CropRect } from '@/lib/cropImageFromImg';
import { detectBubbles } from '@/lib/bubbleDetector';

export function useBubbleTranslate() {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const startTranslate = useCallback((img: HTMLImageElement) => {
    imgRef.current = img;
    setIsTranslating(true);
  }, []);

  const handleClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      const img = imgRef.current;
      if (!img) return;

      const rect = img.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const bubble = await detectBubbles(img, clickX, clickY);
      if (!bubble) {
        return;
      }

      const cropRect: CropRect = {
        x: bubble.x,
        y: bubble.y,
        width: bubble.width,
        height: bubble.height,
      };

      try {
        const blob = await cropImageFromImg(img, cropRect);
        const text = await recognizeJapaneseFromBlob(blob);
        return text;
      } catch (err) {
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
    [],
  );

  return {
    imgRef,
    isTranslating,
    startTranslate,
    handleClick,
  };
}
