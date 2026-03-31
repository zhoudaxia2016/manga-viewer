export interface BubbleRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  area: number;
}

const WORK_WIDTH = 700;
const SEED_CLOSE_RADIUS = 4;
const MAX_FILL_RATIO = 0.20;
const MIN_FILL_PIXELS = 40;
const SEED_SEARCH_RADIUS = 20;

export async function detectBubbles(
  img: HTMLImageElement,
  clickX: number,
  clickY: number,
): Promise<BubbleRegion | null> {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const cw = img.clientWidth;
  const ch = img.clientHeight;
  if (!nw || !nh || !cw || !ch) {
    console.log('[bubble] image not ready');
    return null;
  }

  const ratio = Math.min(1, WORK_WIDTH / nw);
  const sw = Math.round(nw * ratio);
  const sh = Math.round(nh * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  try {
    ctx.drawImage(img, 0, 0, sw, sh);
  } catch {
    console.log('[bubble] drawImage failed (CORS?)');
    return null;
  }

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, sw, sh);
  } catch {
    console.log('[bubble] getImageData failed (canvas tainted)');
    return null;
  }
  const { data } = imageData;

  const cx = clamp(Math.round(clickX * sw / cw), 0, sw - 1);
  const cy = clamp(Math.round(clickY * sh / ch), 0, sh - 1);

  const gray = new Uint8Array(sw * sh);
  for (let i = 0; i < gray.length; i++) {
    const j = i * 4;
    gray[i] = Math.round(data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114);
  }

  const clickLum = gray[cy * sw + cx];
  const thresh = Math.max(clickLum - 50, 140);
  console.log('[bubble]', `lum=${clickLum} thresh=${thresh} pos=(${cx},${cy})/${sw}x${sh}`);

  const len = sw * sh;
  const bin = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bin[i] = gray[i] >= thresh ? 1 : 0;
  }

  const seedMap = morphClose(bin, sw, sh, SEED_CLOSE_RADIUS);
  const fillMap = bin;

  let seedX = cx, seedY = cy;
  if (!seedMap[cy * sw + cx]) {
    const found = findNearestBright(seedMap, sw, sh, cx, cy, SEED_SEARCH_RADIUS);
    if (!found) {
      console.log('[bubble]', `no seed within r=${SEED_SEARCH_RADIUS}`);
      return null;
    }
    seedX = found[0];
    seedY = found[1];
  }

  if (!fillMap[seedY * sw + seedX]) {
    const found = findNearestBright(fillMap, sw, sh, seedX, seedY, 5);
    if (found) { seedX = found[0]; seedY = found[1]; }
  }

  const visited = new Uint8Array(len);
  const stack: number[] = [seedX, seedY];
  visited[seedY * sw + seedX] = 1;

  let minX = seedX, maxX = seedX, minY = seedY, maxY = seedY;
  let count = 0;
  const maxFill = Math.round(len * MAX_FILL_RATIO);

  while (stack.length > 0) {
    const py = stack.pop()!;
    const px = stack.pop()!;
    count++;
    if (count > maxFill) {
      console.log('[bubble]', `fill overflow (${count}>${maxFill})`);
      return null;
    }

    if (px < minX) minX = px;
    else if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    else if (py > maxY) maxY = py;

    const idx = py * sw + px;
    if (px > 0)      { const ni = idx - 1;  if (!visited[ni] && fillMap[ni]) { visited[ni] = 1; stack.push(px - 1, py); } }
    if (px < sw - 1) { const ni = idx + 1;  if (!visited[ni] && fillMap[ni]) { visited[ni] = 1; stack.push(px + 1, py); } }
    if (py > 0)      { const ni = idx - sw; if (!visited[ni] && fillMap[ni]) { visited[ni] = 1; stack.push(px, py - 1); } }
    if (py < sh - 1) { const ni = idx + sw; if (!visited[ni] && fillMap[ni]) { visited[ni] = 1; stack.push(px, py + 1); } }
  }

  if (count < MIN_FILL_PIXELS) {
    console.log('[bubble]', `fill too small (${count}<${MIN_FILL_PIXELS})`);
    return null;
  }

  const bw = maxX - minX;
  const bh = maxY - minY;
  if (bw < 5 || bh < 5) {
    console.log('[bubble]', `bbox too small (${bw}x${bh})`);
    return null;
  }
  if (bw > sw * 0.7 && bh > sh * 0.7) {
    console.log('[bubble]', `bbox too large (${bw}x${bh} vs ${sw}x${sh})`);
    return null;
  }

  const x0 = minX;
  const y0 = minY;
  const x1 = maxX;
  const y1 = maxY;

  const dxScale = cw / sw;
  const dyScale = ch / sh;

  console.log('[bubble]', `OK fill=${count} bbox=${bw}x${bh}`);

  return {
    x: x0 * dxScale,
    y: y0 * dyScale,
    width: (x1 - x0) * dxScale,
    height: (y1 - y0) * dyScale,
    centerX: ((x0 + x1) / 2) * dxScale,
    centerY: ((y0 + y1) / 2) * dyScale,
    area: count,
  };
}

function morphClose(bin: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return erode(dilate(bin, w, h, r), w, h, r);
}

function findNearestBright(
  closed: Uint8Array, w: number, h: number,
  cx: number, cy: number, maxR: number,
): [number, number] | null {
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && closed[ny * w + nx]) {
          return [nx, ny];
        }
      }
    }
  }
  return null;
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function dilate(bin: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      let found = 0;
      for (let yy = y0; yy <= y1 && !found; yy++) {
        const row = yy * w;
        for (let xx = x0; xx <= x1; xx++) {
          if (bin[row + xx]) { found = 1; break; }
        }
      }
      out[y * w + x] = found;
    }
  }
  return out;
}

function erode(bin: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      let all = 1;
      for (let yy = y0; yy <= y1 && all; yy++) {
        const row = yy * w;
        for (let xx = x0; xx <= x1; xx++) {
          if (!bin[row + xx]) { all = 0; break; }
        }
      }
      out[y * w + x] = all;
    }
  }
  return out;
}

