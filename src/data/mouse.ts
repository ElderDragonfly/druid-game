export const MOUSE = {
  frameWidth: 32, frameHeight: 32,
  feetX: 16, feetY: 25, scale: 1.875,
  bodyWidth: 14, bodyHeight: 8,
  speed: 90,
  spawnDistance: { min: 100, max: 160 },
  runDistance: { min: 60, max: 130 },
  runFrameMs: 100, transitionFrameMs: 90,
  transitionMs: 360, lookMs: 5400,
} as const;
