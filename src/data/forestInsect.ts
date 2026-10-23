import { entityData } from './entityBalance';
import { BASE_MOVEMENT_SPEED } from './movement';
import { WOLF } from './wolf';

export const FOREST_INSECT = {
  id: 'forestInsect',
  get stats() { const d=entityData.forestInsect;return {health:d.health,
    walkSpeed:d.walkSpeed*BASE_MOVEMENT_SPEED,runSpeed:d.runSpeed*BASE_MOVEMENT_SPEED}; },
  get damage() { return entityData.forestInsect.damage; },
  // Shared chase/attack timing profile, independent health/speeds/damage.
  get behavior() { return WOLF.behavior; },
  body: {width:32,height:18},
  appearance: {scale:.9,referenceSpeed:BASE_MOVEMENT_SPEED*.9},
  hitDurationMs:260,deathDurationMs:600,
} as const;
