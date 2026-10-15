export const MOUSE = {
  frameWidth: 32, frameHeight: 32,
  feetX: 16, feetY: 25, scale: 1.25,
  bodyWidth: 14 * 2 / 3, bodyHeight: 8 * 2 / 3,
  speed: 90,
  population: { min: 0, max: 9 },
  runDistance: { min: 60, max: 130 },
  runFrameMs: 100, transitionFrameMs: 90,
  transitionMs: 360, lookMs: 5400,
} as const;
