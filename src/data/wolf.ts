import { BASE_MOVEMENT_SPEED } from './movement';

export const WOLF = {
  id: 'wolf',
  stats: { walkSpeed: BASE_MOVEMENT_SPEED * .45, runSpeed: BASE_MOVEMENT_SPEED * 1.25 },
  appearance: { frameWidth: 128, frameHeight: 112, feetX: 64, feetY: 100, scale: .75,
    walkReferenceSpeed: BASE_MOVEMENT_SPEED * .45, runReferenceSpeed: BASE_MOVEMENT_SPEED * 1.25 },
  body: { width: 54, height: 18 },
  behavior: { detectionX: 1280 / 2 * 2 / 3, detectionY: 720 / 2 * 2 / 3,
    wanderMin: 70, wanderMax: 160, idleMinMs: 800, idleMaxMs: 1800,
    attackMs: 660, recoveryMs: 350, attackGap: 5, pathRefreshMs: 450 },
} as const;
