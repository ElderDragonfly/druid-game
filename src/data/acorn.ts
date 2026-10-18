import { BASE_MOVEMENT_SPEED } from './movement';

export const ACORN = {
  speedMultiplier: 1.5, speed: BASE_MOVEMENT_SPEED * 1.5,
  releaseMs: 580, flightHeight: 38,
  radius: 5, scale: .5, birthMs: 70, spinRadiansPerSecond: Math.PI / 2,
  lifetimeMs: 4000, maxProjectiles: 8,
  trail: { spacingMin: 8, spacingMax: 19, sidewaysSpeed: 12,
    carry: .6, lifetimeMinMs: 430, lifetimeMaxMs: 730,
    scaleMin: .45, scaleMax: .65, maxLeaves: 384 },
} as const;
