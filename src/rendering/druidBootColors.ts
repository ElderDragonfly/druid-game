// Dark leather sampled from the accepted up/down walking sprites, shadow to light.
const LEATHER = [
  [27, 19, 15], [42, 28, 21], [65, 40, 28], [82, 49, 32],
  [98, 58, 36], [120, 74, 45], [131, 84, 49], [152, 98, 60],
];
const luminance = (r: number, g: number, b: number) => .2126 * r + .7152 * g + .0722 * b;
const shades = LEATHER.map(([r, g, b]) => luminance(r, g, b));

/** Correct side-view leather in a working texture, leaving the approved PNGs intact. */
export function matchSideBootColors(pixels: Uint8ClampedArray, width: number, direction: 'left' | 'right') {
  for (let y = 55; y < 75; y++) for (let x = 0; x < width; x++) {
    const localX = x % 64;
    // Staff lies outside the legs; the boot toes can extend past it at the bottom.
    if (localX < 12 || localX > 50 || (direction === 'left' && localX < 22 && y < 68) ||
      (direction === 'right' && localX > 43 && y < 70)) continue;
    const i = (y * width + x) * 4;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (!pixels[i + 3] || r < 40 || r <= g * 1.15 || g <= b * 1.15) continue;
    const light = Math.min(90, luminance(r, g, b) * .78);
    const upper = shades.findIndex(value => value >= light);
    const hi = upper < 0 ? shades.length - 1 : upper, lo = Math.max(0, hi - 1);
    const mix = hi === lo ? 0 : Math.max(0, (light - shades[lo]) / (shades[hi] - shades[lo]));
    for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(LEATHER[lo][c] * (1 - mix) + LEATHER[hi][c] * mix);
  }
}
