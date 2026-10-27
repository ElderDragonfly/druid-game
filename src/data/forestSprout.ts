import { entityData } from './entityBalance';
import { BASE_MOVEMENT_SPEED } from './movement';
export const FOREST_SPROUT={
  get health(){return entityData.forestSprout.health;},
  get speed(){return entityData.forestSprout.speed*BASE_MOVEMENT_SPEED;},
  get damage(){return entityData.forestSprout.damage;},
  body:{width:26,height:16},
  emergeMs:420,tagMs:360,windupMs:350,leapMs:380,recoveryMs:480,
  jumpSpeed:BASE_MOVEMENT_SPEED*1.8,attackDistance:105,contactGap:10,
  roomId:1,count:6,bushes:{min:24,max:36},spacing:125,
} as const;
