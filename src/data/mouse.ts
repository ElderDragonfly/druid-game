import { entityData } from './entityBalance';
export const MOUSE = {
  frameWidth: 32, frameHeight: 32,
  feetX: 16, feetY: 25, scale: 1.25,
  bodyWidth: 14 * 2 / 3, bodyHeight: 8 * 2 / 3,
  get speed() { return entityData.mouse.speed; },
  get population() { return entityData.mouse.population; },
  get runDistance() { return entityData.mouse.runDistance; },
  runFrameMs: 100, transitionFrameMs: 90,
  transitionMs: 360, get lookMs() { return entityData.mouse.lookMs; },
} as const;
