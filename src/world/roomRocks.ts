import art from '../../docs/art/sprouts-rocks-v1/art.json';
import type { BonePlacement } from './skeletonRoom';

export const ROOM_ROCK_SCALE=.24;
export function rockVisualRect(p:BonePlacement){
  const a=art.rocks[p.variant],width=a.width*ROOM_ROCK_SCALE,height=a.height*ROOM_ROCK_SCALE;
  return {x:p.x-width/2,y:p.y-height,width,height};
}
/** A projected base, rather than the entire upright silhouette. */
export function rockCollisionRect(p:BonePlacement){
  const r=rockVisualRect(p),width=r.width*.76,height=Math.max(10,r.height*.27);
  return {x:p.x-width/2,y:p.y-height,width,height};
}
