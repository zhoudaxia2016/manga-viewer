/** Pluggable Japanese OCR backend (bubble crop → plain text). */
export interface JapaneseOcrBackend {
  readonly id: string;
  recognizeJapanese(blob: Blob): Promise<string>;
}
