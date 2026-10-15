import type { FloorRaster } from './forestFloor';

export const GRASS_COVERAGE = { immersion: 5, width: 64 } as const;

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
