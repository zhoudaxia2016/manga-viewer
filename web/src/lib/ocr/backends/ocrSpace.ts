import type { JapaneseOcrBackend } from '../types';

const OCR_API_URL = '/api/ocr';
const MAX_UPLOAD_BYTES = 950_000;

async function preprocessImage(blob: Blob): Promise<Blob> {
  const img = await createImageBitmap(blob);

  const MIN_DIM = 600;
  const MAX_LONG = 1600;
  const longest = Math.max(img.width, img.height);
  const shortest = Math.min(img.width, img.height);
  let scale = shortest < MIN_DIM ? MIN_DIM / shortest : 1;
  if (longest * scale > MAX_LONG) scale *= MAX_LONG / (longest * scale);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  const png = await canvasToBlob(canvas, 'image/png');
  if (png.size <= MAX_UPLOAD_BYTES) return png;

  return canvasToBlob(canvas, 'image/jpeg', 0.92);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      type,
      quality,
    );
  });
}

function parseOcrSpaceResponse(data: {
  ParsedResults?: Array<{ ParsedText?: string }>;
  ErrorMessage?: string[];
  IsErroredOnProcessing?: boolean;
}, resOk: boolean, statusText: string): string {
  if (!resOk || data.IsErroredOnProcessing || data.ErrorMessage?.length) {
    throw new Error(`OCR failed: ${data.ErrorMessage?.join(', ') ?? statusText}`);
  }

  const text = data.ParsedResults?.[0]?.ParsedText ?? '';
  const lines = text
    .replace(/\s*\n\s*/g, '\n')
    .trim()
    .split('\n')
    .filter(line => !/^[A-Z\s]+$/.test(line.trim()));

  const isFurigana = (line: string) => {
    const t = line.trim();
    return t.length <= 2 && /^[\u3040-\u309F\u30A0-\u30FF]+$/.test(t);
  };

  const cleaned = lines.filter((line, i) => {
    if (!isFurigana(line)) return true;
    const prev = lines[i - 1]?.trim() ?? '';
    const next = lines[i + 1]?.trim() ?? '';
    if (!prev && !next) return false;
    if (prev && !next) return false;
    if (!prev && next) return false;
    return true;
  });

  return cleaned.join('\n');
}

/** OCR.space via your `/api/ocr` proxy. Swap `activeJapaneseOcr` in `../index.ts` for another backend. */
export const ocrSpaceBackend: JapaneseOcrBackend = {
  id: 'ocr.space',

  async recognizeJapanese(blob: Blob): Promise<string> {
    const processed = await preprocessImage(blob);
    console.debug('[OCR]', ocrSpaceBackend.id, 'blob size:', processed.size, 'bytes');

    const form = new FormData();
    form.append('file', processed, 'image.png');
    form.append('language', 'jpn');

    const res = await fetch(OCR_API_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(120_000),
    });

    const data = (await res.json()) as {
      ParsedResults?: Array<{ ParsedText?: string }>;
      ErrorMessage?: string[];
      IsErroredOnProcessing?: boolean;
    };

    return parseOcrSpaceResponse(data, res.ok, res.statusText);
  },
};
