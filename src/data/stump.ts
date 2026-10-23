import art from '../../docs/art/ritual-stump-v1/sprite.json';
export const STUMP = {
  art, texture:'ritual-stump',
  bodyWidth:76, bodyHeight:28,
  interactionRadius:44,
  // One instance in the reference 1280×720 start view; keep it off the spawn.
  offsetX:360, offsetY:160, minimumSpawnDistance:150,
  clearing:{left:130,top:150,width:260,height:240},
} as const;
