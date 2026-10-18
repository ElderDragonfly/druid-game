/** All coordinates are in the 960×540 camp image, whose menu top is y=50. */
export const CAMP_ATMOSPHERE = {
  frameCount: 8, framesPerRow: 4, menuTop: 50,
  fire: { x: 584, y: 282, width: 128, height: 148, fps: 10 },
  water: { x: 408, y: 245, width: 204, height: 142, fps: 8 },
  fireflies: [
    { x: 229, y: 184, radiusX: 15, radiusY: 10, periodMs: 9200, phase: .2 },
    { x: 437, y: 223, radiusX: 18, radiusY: 12, periodMs: 11700, phase: 1.5 },
    { x: 490, y: 260, radiusX: 12, radiusY: 9, periodMs: 13400, phase: 2.6 },
    { x: 741, y: 211, radiusX: 20, radiusY: 13, periodMs: 8100, phase: 3.4 },
    { x: 868, y: 113, radiusX: 14, radiusY: 11, periodMs: 10600, phase: 4.8 },
  ],
} as const;

export function fireflyPosition(index: number, elapsedMs: number) {
  const fly = CAMP_ATMOSPHERE.fireflies[index];
  const a = elapsedMs / fly.periodMs * Math.PI * 2 + fly.phase;
  return { x: fly.x + Math.cos(a) * fly.radiusX + Math.sin(a * 2) * 3,
    y: CAMP_ATMOSPHERE.menuTop + fly.y + Math.sin(a) * fly.radiusY + Math.cos(a * 3) * 2 };
}
