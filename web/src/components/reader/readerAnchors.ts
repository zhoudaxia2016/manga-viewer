/** 视口内矩形（fixed 定位用） */
export interface BubbleAnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 根据图片与裁剪区在滚动时重算气泡位置 */
export interface OcrLookupScrollSource {
  imageIdx: number;
  cropDisplay: { x: number; y: number; width: number; height: number };
}
