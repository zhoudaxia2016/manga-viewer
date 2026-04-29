import { useState, useCallback, useRef, useEffect } from 'react';
import Tesseract from 'tesseract.js';

interface UseOcrReturn {
  recognize: (imageData: ImageData | string) => Promise<string>;
  isReady: boolean;
  isProcessing: boolean;
  progress: number;
  error: string | null;
}

export function useOcr(): UseOcrReturn {
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Tesseract.Worker | null>(null);

  const ensureWorker = useCallback(async () => {
    if (!workerRef.current) {
      const worker = await Tesseract.createWorker('jpn');
      await worker.setParameters({
        preserve_interword_spaces: '1',
      });
      workerRef.current = worker;
      setIsReady(true);
    }
    return workerRef.current;
  }, []);

  useEffect(() => {
    return () => {
      const w = workerRef.current;
      if (w) {
        w.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const recognize = useCallback(async (imageData: ImageData | string) => {
    setError(null);
    setProgress(0);
    setIsProcessing(true);
    try {
      const worker = await ensureWorker();
      let input: Tesseract.ImageLike = imageData;
      if (imageData instanceof ImageData) {
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.putImageData(imageData, 0, 0);
        input = canvas;
      }
      
      console.log('[useOcr] Starting recognition, input type:', typeof input);
      const result = await worker.recognize(input);
      console.log('[useOcr] Recognition complete', result);
      
      setIsProcessing(false);
      setProgress(100);
      return result.data?.text ?? '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OCR error';
      console.error('[useOcr] Recognition error:', err);
      setError(msg);
      setIsProcessing(false);
      throw err;
    }
  }, [ensureWorker]);

  return {
    recognize,
    isReady,
    isProcessing,
    progress,
    error,
  };
}
