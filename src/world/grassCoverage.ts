import type { FloorRaster } from './forestFloor';

export const GRASS_COVERAGE = { immersion: 8, width: 64 } as const;

// Outlines of upright clumps in the approved 256×256 working sample.
// They mark existing pixels; they neither repaint the source nor add new plants.
const CLUMPS = [
  [[26, 78], [20, 53], [33, 65], [28, 36], [42, 61], [40, 27], [50, 64], [62, 36], [55, 68], [74, 48], [65, 80]],
  [[112, 57], [109, 31], [119, 45], [121, 17], [129, 43], [141, 22], [136, 49], [151, 37], [143, 59]],
  [[217, 58], [210, 30], [224, 44], [226, 13], [235, 38], [248, 18], [241, 49], [255, 37], [250, 60]],
  [[115, 115], [108, 91], [122, 104], [121, 81], [131, 98], [143, 84], [137, 109], [151, 100], [144, 118]],
  [[54, 156], [49, 128], [63, 144], [60, 113], [73, 137], [76, 110], [82, 140], [98, 125], [92, 157]],
  [[14, 177], [10, 150], [23, 165], [22, 141], [31, 161], [44, 146], [39, 176]],
  [[30, 230], [26, 206], [39, 219], [39, 196], [48, 215], [64, 198], [57, 232]],
  [[201, 213], [193, 187], [208, 203], [208, 176], [219, 195], [233, 181], [226, 206], [243, 195], [235, 216]],
  [[156, 247], [147, 221], [162, 233], [163, 212], [173, 229], [186, 218], [181, 240], [197, 228], [190, 250]],
];

export function grassHeights(width: number, height: number) {
  const result = new Uint8Array(width * height);
  for (const outline of CLUMPS) {
    const points = outline.map(([x, y]) => [x * width / 256, y * height / 256]);
    const root = Math.min(height - 1, Math.floor(Math.max(...points.map(point => point[1]))));
    const left = Math.max(0, Math.floor(Math.min(...points.map(point => point[0]))));
    const right = Math.min(width - 1, Math.ceil(Math.max(...points.map(point => point[0]))));
    const top = Math.max(0, Math.floor(Math.min(...points.map(point => point[1]))));
    for (let y = top; y < root; y++) for (let x = left; x <= right; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [ax, ay] = points[i], [bx, by] = points[j];
        if ((ay > y + 0.5) !== (by > y + 0.5) && x + 0.5 < (bx - ax) * (y + 0.5 - ay) / (by - ay) + ax) inside = !inside;
      }
      if (inside) result[y * width + x] = root - y;
    }
  }
  return result;
}

/** Copy only grass rooted in front of the feet; all colors stay at their world positions. */
export function sampleGrassForeground(raster: FloorRaster, footX: number, footY: number,
  target: Uint8ClampedArray, width: number, height: number) {
  target.fill(0);
  const left = Math.floor(footX - width / 2), top = Math.floor(footY) - height + 1;
  let covered = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = left + x, sy = top + y;
    if (sx < 0 || sy < 0 || sx >= raster.width || sy >= raster.height) continue;
    const index = sy * raster.width + sx, bladeHeight = raster.grassHeights?.[index] ?? 0;
    if (!bladeHeight || sy + bladeHeight <= footY) continue;
    const from = index * 4, to = (y * width + x) * 4;
    target[to] = raster.pixels[from]; target[to + 1] = raster.pixels[from + 1];
    target[to + 2] = raster.pixels[from + 2]; target[to + 3] = raster.pixels[from + 3];
    covered++;
  }
  return { left, top, covered };
}
