import { WITCH_CIRCLE as CONFIG } from '../data/witchCircle';
import { environmentVariant } from '../data/environment';
import { seededRandom } from './random';
import { overlaps, type Rect } from './geometry';
import { roomAt, roomBounds, ritualTreeClearing } from './rooms';
import { stumpClearing } from './stump';
import { logVisualRect } from './fallenLogs';
import { obstacleRect, obstacleVisualRect, type MeadowLayout, type ObstaclePlacement } from './meadowLayout';

export interface RingMushroom { x:number; y:number; variant:number; height:number }
export interface WitchCirclePlacement { x:number; y:number; mushrooms:RingMushroom[] }

export function groveInterior(layout:Pick<MeadowLayout,'width'|'height'>):Rect {
  const r=roomBounds(layout,CONFIG.roomId),i=CONFIG.interiorInset;
  return {x:r.x+r.width*i,y:r.y+r.height*i,width:r.width*(1-2*i),height:r.height*(1-2*i)};
}
export function rectTouchesCircle(rect:Rect,point:{x:number;y:number},radius:number) {
  return Math.hypot(Math.max(rect.x-point.x,0,point.x-rect.x-rect.width),
    Math.max(rect.y-point.y,0,point.y-rect.y-rect.height))<=radius;
}
export function treeInGroveCenter(layout:MeadowLayout,tree:ObstaclePlacement) {
  if(roomAt(layout,tree)!==CONFIG.roomId)return false;
  const r=groveInterior(layout);
  return tree.x>r.x&&tree.x<r.x+r.width&&tree.y>r.y&&tree.y<r.y+r.height;
}
export function generateWitchCircle(layout:Pick<MeadowLayout,'seed'|'width'|'height'>):WitchCirclePlacement {
  const random=seededRandom(layout.seed^0x57495443),r=groveInterior(layout);
  const x=Math.round(r.x+r.width/2+(random()*2-1)*r.width*.15);
  const y=Math.round(r.y+r.height/2+(random()*2-1)*r.height*.15);
  const count=CONFIG.ringCount.min+Math.floor(random()*(CONFIG.ringCount.max-CONFIG.ringCount.min+1));
  const variants=Array.from({length:count},(_,i)=>i<4?i:Math.floor(random()*4));
  for(let i=count-1;i>0;i--){const j=Math.floor(random()*(i+1));[variants[i],variants[j]]=[variants[j],variants[i]];}
  const rotation=random()*Math.PI*2;
  return {x,y,mushrooms:variants.map((variant,i)=>{
    const angle=rotation+i*Math.PI*2/count+(random()*2-1)*Math.PI/count*.18;
    const radius=CONFIG.radius+(random()*2-1)*CONFIG.radialJitter;
    return {x:Math.round(x+Math.cos(angle)*radius),y:Math.round(y+Math.sin(angle)*radius),variant,
      height:CONFIG.ringHeight.min+random()*(CONFIG.ringHeight.max-CONFIG.ringHeight.min)};
  })};
}

/** Keep existing trees except those newly excluded by the grove/circle. */
export function prepareWitchGrove(layout:MeadowLayout,protectedActors:readonly Rect[]=[]):boolean {
  let changed=false;
  if(!layout.witchCircle){layout.witchCircle=generateWitchCircle(layout);changed=true;}
  const circle=layout.witchCircle;
  const excluded=(tree:ObstaclePlacement)=>treeInGroveCenter(layout,tree)||
    rectTouchesCircle(obstacleVisualRect(tree),circle,CONFIG.clearingRadius+8);
  const moving=layout.obstacles.flatMap((tree,index)=>excluded(tree)?[index]:[]);
  if(!moving.length)return changed;
  const indices=new Set(moving),accepted=layout.obstacles.filter((_,i)=>!indices.has(i));
  const reserved=[...protectedActors,...(layout.logs??[]).map(logVisualRect),
    ...(layout.stump?[stumpClearing(layout.stump)]:[]),
    ...(layout.rooms??[]).flatMap(room=>room.tree?[ritualTreeClearing(room.tree)]:[]),
    {x:layout.spawn.x-80,y:layout.spawn.y-80,width:160,height:160}];
  const random=seededRandom(layout.seed^0x47524f56);
  for(const index of moving){
    const original=layout.obstacles[index],room=roomBounds(layout,roomAt(layout,original)),art=environmentVariant(original.kind,original.variant);
    let placed=false;
    for(let attempt=0;attempt<10000;attempt++){
      const p={...original,x:room.x+24+random()*(room.width-48),y:room.y+24+random()*(room.height-48)};
      const v=obstacleVisualRect(p),body=obstacleRect(p);
      if(v.x<3||v.y<3||v.x+v.width>layout.width-3||v.y+v.height>layout.height-3||excluded(p))continue;
      if(reserved.some(r=>overlaps(v,r,24))||accepted.some(t=>overlaps(body,obstacleRect(t),28)))continue;
      layout.obstacles[index]=p;accepted.push(p);placed=true;break;
    }
    if(!placed)throw new Error(`Не удалось разместить дерево опушки ${index} (${art.id})`);
  }
  return true;
}
