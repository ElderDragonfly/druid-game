import { BASE_MOVEMENT_SPEED } from './movement';
import { MEADOW_WORLD } from '../world/meadowLayout';

export const WOLF = {
  id: 'wolf',
  population: { min: 0, max: 18, spacing: 100 },
  stats: { health: 2, walkSpeed: BASE_MOVEMENT_SPEED * .45, runSpeed: BASE_MOVEMENT_SPEED },
  combat: { damage: 1, hitFrameDurations: [30, 60, 70, 60, 40] },
  appearance: { frameWidth: 128, frameHeight: 112, feetX: 64, feetY: 100, scale: .75,
    walkReferenceSpeed: BASE_MOVEMENT_SPEED * .45, runReferenceSpeed: BASE_MOVEMENT_SPEED * 1.25 },
  body: { width: 54, height: 18 },
  behavior: { detectionX: 1280 / 2 * 2 / 3, detectionY: 720 / 2 * 2 / 3,
    projectileDetectionX: MEADOW_WORLD.cameraRadiusX, projectileDetectionY: MEADOW_WORLD.cameraRadiusY,
    wanderMin: 70, wanderMax: 160, idleMinMs: 800, idleMaxMs: 1800,
    attackMs: 660, impactMs: 240, recoveryMs: 350, attackGap: 5, pathRefreshMs: 450 },
} as const;
