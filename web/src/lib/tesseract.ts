export const TESSERACT_LANG_URL =
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract-lang-jpn.js';

export async function initTesseract(): Promise<void> {
  try {
    await import('tesseract.js');
  } catch (err) {
    console.error('[initTesseract] failed to load tesseract.js', err);
  }
}
