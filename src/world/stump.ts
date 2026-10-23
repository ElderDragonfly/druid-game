import { STUMP } from '../data/stump';
import { seededRandom } from './random';
import type { Rect } from './geometry';
export interface StumpPlacement { x:number; y:number }
export function stumpRect(point:StumpPlacement):Rect {
  return {x:point.x-STUMP.bodyWidth/2,y:point.y-STUMP.bodyHeight,
    width:STUMP.bodyWidth,height:STUMP.bodyHeight};
}
export function stumpVisualRect(point:StumpPlacement):Rect {
  const a=STUMP.art;
  return {x:point.x-a.anchorX*a.scale,y:point.y-a.anchorY*a.scale,width:a.width*a.scale,height:a.height*a.scale};
}
export function stumpClearing(point:StumpPlacement):Rect {
  const c=STUMP.clearing;
  return {x:point.x-c.left,y:point.y-c.top,width:c.width,height:c.height};
}
export function generateStump(seed:number,spawn:StumpPlacement):StumpPlacement {
  const random=seededRandom(seed^0x5354554d);
  for(let attempt=0;attempt<64;attempt++) {
    const angle=random()*Math.PI*2,radius=.55+.45*random();
    const dx=Math.cos(angle)*STUMP.offsetX*radius,dy=Math.sin(angle)*STUMP.offsetY*radius;
    if(Math.hypot(dx,dy)>=STUMP.minimumSpawnDistance)return {x:spawn.x+dx,y:spawn.y+dy};
  }
  return {x:spawn.x+240,y:spawn.y+80};
}
export function distanceToStump(stump:StumpPlacement,point:StumpPlacement) {
  const r=stumpRect(stump);
  return Math.hypot(Math.max(r.x-point.x,0,point.x-r.x-r.width),Math.max(r.y-point.y,0,point.y-r.y-r.height));
}
