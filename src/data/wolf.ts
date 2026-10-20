import { BASE_MOVEMENT_SPEED } from './movement';
import { entityData } from './entityBalance';

export const WOLF = {
  id: 'wolf',
  get population() { return { ...entityData.wolf.population, spacing: 100 }; },
  get stats() { const w = entityData.wolf; return { health: w.health, walkSpeed: BASE_MOVEMENT_SPEED * w.walkSpeed, runSpeed: BASE_MOVEMENT_SPEED * w.runSpeed }; },
  combat: { get damage() { return entityData.wolf.damage; }, hitFrameDurations: [30, 60, 70, 60, 40] },
  appearance: { frameWidth: 128, frameHeight: 112, feetX: 64, feetY: 100, scale: .75,
    walkReferenceSpeed: BASE_MOVEMENT_SPEED * .45, runReferenceSpeed: BASE_MOVEMENT_SPEED * 1.25 },
  body: { width: 54, height: 18 },
  get behavior() { return entityData.wolf.behavior; },
} as const;
