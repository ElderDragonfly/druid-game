import { entityData } from './entityBalance';
import { BASE_MOVEMENT_SPEED } from './movement';
import { MEADOW_WORLD } from '../world/meadowLayout';
export const BEAR={
 id:'bear',
 get stats(){const b=entityData.bear;return {health:b.health,walkSpeed:b.walkSpeed*BASE_MOVEMENT_SPEED,runSpeed:b.runSpeed*BASE_MOVEMENT_SPEED};},
 get damage(){return entityData.bear.damage;},
 body:{width:96,height:28},appearance:{scale:2,walkReferenceSpeed:BASE_MOVEMENT_SPEED*.6,runReferenceSpeed:BASE_MOVEMENT_SPEED*.8},
 wakeRadiusX:MEADOW_WORLD.cameraRadiusX/2,wakeRadiusY:MEADOW_WORLD.cameraRadiusY/2,
 attackGap:12,recoveryMs:450,hitMs:260,
} as const;
