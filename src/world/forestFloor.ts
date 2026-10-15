import { seededRandom } from './meadowLayout';

export interface FloorRaster { width: number; height: number; pixels: Uint8ClampedArray; id?: string; weight?: number }
export const FOREST_FLOOR = {
  pixelScale: 1.25,
  sampleSize: 256,
  patchSize: 96,
  overlap: 24,
  candidates: 12,
  matchStride: 4,
} as const;

function copyPixel(source: Uint8ClampedArray, from: number, target: Uint8ClampedArray, to: number) {
  target[to] = source[from];
  target[to + 1] = source[from + 1];
  target[to + 2] = source[from + 2];
  target[to + 3] = source[from + 3];
}

// A connected path across an overlap; each next pixel can move one cell sideways.
function minimumCut(cost: Float64Array, width: number, height: number) {
  const totals = cost.slice(), parents = new Int8Array(cost.length);
  for (let y = 1; y < height; y++) for (let x = 0; x < width; x++) {
    const previous = (y - 1) * width;
    let best = x;
    if (x > 0 && totals[previous + x - 1] < totals[previous + best]) best = x - 1;
    if (x + 1 < width && totals[previous + x + 1] < totals[previous + best]) best = x + 1;
    totals[y * width + x] += totals[previous + best];
    parents[y * width + x] = best - x;
  }
  const path = new Int16Array(height), last = (height - 1) * width;
  let x = 0;
  for (let i = 1; i < width; i++) if (totals[last + i] < totals[last + x]) x = i;
  for (let y = height - 1; y >= 0; y--) {
    path[y] = x;
    x += parents[y * width + x];
  }
  return path;
}

/** Seeded image quilting: preserve colors and upright blades; translate crops only. */
export function generateForestFloor(input: FloorRaster | readonly FloorRaster[], width: number, height: number, seed: number) {
  const { patchSize, overlap, candidates, matchStride } = FOREST_FLOOR;
  const sources: readonly FloorRaster[] = Array.isArray(input) ? input : [input as FloorRaster];
  const source = sources[0];
  if (!source || sources.some(sample => sample.width !== source.width || sample.width !== sample.height ||
    sample.width < patchSize || sample.pixels.length !== sample.width * sample.height * 4 || (sample.weight ?? 1) <= 0)) {
    throw new Error('Forest floor requires a square RGBA sample larger than its patches');
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('Forest floor dimensions must be positive integers');
  }
  const banks = sources.map(sample => ({ id: sample.id ?? 'grass', weight: sample.weight ?? 1, pixels: sample.pixels }));
  const totalWeight = banks.reduce((sum, bank) => sum + bank.weight, 0);
  const sourceCounts: Record<string, number> = {};
  const pixels = new Uint8ClampedArray(width * height * 4);
  const random = seededRandom(seed ^ 0x51f15e), step = patchSize - overlap;
  const columns = Math.max(1, Math.ceil((width - patchSize) / step) + 1);
  const rows = Math.max(1, Math.ceil((height - patchSize) / step) + 1);
  let patchCount = 0;
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const x = column * step, y = row * step;
    const w = Math.min(patchSize, width - x), h = Math.min(patchSize, height - y);
    const left = x > 0 ? Math.min(overlap, w) : 0;
    const top = y > 0 ? Math.min(overlap, h) : 0;
    let ticket = random() * totalWeight;
    const bank = banks.find(item => { ticket -= item.weight; return ticket < 0; }) ?? banks[banks.length - 1];
    sourceCounts[bank.id] = (sourceCounts[bank.id] ?? 0) + 1;
    const chosen = bank.pixels;
    let ox = 0, oy = 0, bestScore = Infinity;
    const error = (data: Uint8ClampedArray, sx: number, sy: number, px: number, py: number) => {
      const a = ((y + py) * width + x + px) * 4;
      const b = ((sy + py) * source.width + sx + px) * 4;
      const r = pixels[a] - data[b], g = pixels[a + 1] - data[b + 1], blue = pixels[a + 2] - data[b + 2];
      return r * r + g * g + blue * blue;
    };
    for (let attempt = 0; attempt < (left || top ? candidates : 1); attempt++) {
      const sx = Math.floor(random() * (source.width - patchSize + 1));
      const sy = Math.floor(random() * (source.height - patchSize + 1));
      let score = 0;
      for (let py = 0; py < top; py += matchStride) for (let px = 0; px < w; px += matchStride) score += error(chosen, sx, sy, px, py);
      for (let py = top; py < h; py += matchStride) for (let px = 0; px < left; px += matchStride) score += error(chosen, sx, sy, px, py);
      if (score < bestScore) { bestScore = score; ox = sx; oy = sy; }
    }
    let vertical: Int16Array | undefined, horizontal: Int16Array | undefined;
    if (left) {
      const cost = new Float64Array(left * h);
      for (let py = 0; py < h; py++) for (let px = 0; px < left; px++) cost[py * left + px] = error(chosen, ox, oy, px, py);
      vertical = minimumCut(cost, left, h);
    }
    if (top) {
      const cost = new Float64Array(top * w);
      for (let px = 0; px < w; px++) for (let py = 0; py < top; py++) cost[px * top + py] = error(chosen, ox, oy, px, py);
      horizontal = minimumCut(cost, top, w);
    }
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      if ((vertical && px < vertical[py]) || (horizontal && py < horizontal[px])) continue;
      const from = ((oy + py) * source.width + ox + px) * 4, to = ((y + py) * width + x + px) * 4;
      copyPixel(chosen, from, pixels, to);
    }
    patchCount++;
  }
  return { width, height, pixels, patchCount, sourceCounts };
}
