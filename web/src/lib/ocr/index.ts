import type { JapaneseOcrBackend } from './types';
import { ocrSpaceBackend } from './backends/ocrSpace';

let active: JapaneseOcrBackend = ocrSpaceBackend;

/** Replace at runtime to try another engine (e.g. future local / Tesseract / cloud). */
export function setJapaneseOcrBackend(backend: JapaneseOcrBackend): void {
  active = backend;
}

export function getJapaneseOcrBackend(): JapaneseOcrBackend {
  return active;
}

export function recognizeJapaneseFromBlob(blob: Blob): Promise<string> {
  return active.recognizeJapanese(blob);
}

export type { JapaneseOcrBackend } from './types';
export { ocrSpaceBackend } from './backends/ocrSpace';
