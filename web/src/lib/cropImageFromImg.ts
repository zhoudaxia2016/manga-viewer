export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** `rect` 相对 img 的显示区域（与选区层坐标一致） */
export async function cropImageFromImg(
  img: HTMLImageElement,
  rect: CropRect,
): Promise<Blob> {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const rw = img.clientWidth;
  const rh = img.clientHeight;
  if (!nw || !nh || !rw || !rh) {
    throw new Error('Image not ready for crop');
  }

  const scaleX = nw / rw;
  const scaleY = nh / rh;
  const sx = Math.max(0, Math.floor(rect.x * scaleX));
  const sy = Math.max(0, Math.floor(rect.y * scaleY));
  const sw = Math.min(nw - sx, Math.ceil(rect.width * scaleX));
  const sh = Math.min(nh - sy, Math.ceil(rect.height * scaleY));
  if (sw < 1 || sh < 1) {
    throw new Error('Invalid crop region');
  }

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/png',
    );
  });
}
