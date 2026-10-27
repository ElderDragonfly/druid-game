import { BASE_MOVEMENT_SPEED } from './movement';
import { entityData } from './entityBalance';
import { WOLF } from './wolf';

/** Provisional combat balance; artwork and room population are independent. */
export const SKELETON = {
  id: 'skeleton',
  get stats() { const s=entityData.skeleton; return {health:s.health,
    walkSpeed:BASE_MOVEMENT_SPEED*s.walkSpeed,runSpeed:BASE_MOVEMENT_SPEED*s.runSpeed}; },
  get damage(){return entityData.skeleton.damage;},
  body:{width:28,height:18},
  appearance:{scale:.5,walkReferenceSpeed:BASE_MOVEMENT_SPEED*.8},
  get behavior(){return {...WOLF.behavior,attackMs:900,impactMs:450,recoveryMs:500,attackGap:10};},
} as const;

export const SKELETON_ROOM={roomId:0,bones:{min:24,max:36},enemies:{min:4,max:5},
  spacing:110,boneScale:.32} as const;
