import { BASE_MOVEMENT_SPEED } from './movement';
import { CAST_RELEASE_MS } from './attack';
import { MEADOW_WORLD } from '../world/meadowLayout';

export const ACORN = {
  damage: 1,
  speedMultiplier: 1.5, speed: BASE_MOVEMENT_SPEED * 1.5,
  releaseMs: CAST_RELEASE_MS, flightHeight: 38,
  radius: 5, scale: .5, birthMs: 70, spinRadiansPerSecond: Math.PI / 2,
  rangeX: MEADOW_WORLD.width / 3 * .4, rangeY: MEADOW_WORLD.height / 3 * .4,
  descentMs: 250, maxProjectiles: 8,
  trail: { spacingMin: 8, spacingMax: 19, sidewaysSpeed: 12,
    carry: .6, lifetimeMinMs: 430, lifetimeMaxMs: 730,
    scaleMin: .45, scaleMax: .65, maxLeaves: 384 },
} as const;
