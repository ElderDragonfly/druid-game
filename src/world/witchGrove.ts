import { WITCH_CIRCLE as CONFIG } from '../data/witchCircle';
import mushrooms from '../../docs/art/witch-circle-v2/sprites.json';
import { seededRandom } from './random';
import { overlaps, type Rect } from './geometry';
import { roomAt, roomBounds, ritualTreeClearing } from './rooms';
import { stumpClearing } from './stump';
import { logVisualRect } from './fallenLogs';
import { obstacleRect, obstacleVisualRect, type MeadowLayout, type ObstaclePlacement } from './meadowLayout';

export interface RingMushroom { x:number; y:number; variant:number; height:number }
export interface WitchCirclePlacement { x:number; y:number; version?:2; mushrooms:RingMushroom[] }

export function groveInterior(layout:Pick<MeadowLayout,'width'|'height'>):Rect {
  const r=roomBounds(layout,CONFIG.roomId),i=CONFIG.interiorInset;
  return {x:r.x+r.width*i,y:r.y+r.height*i,width:r.width*(1-2*i),height:r.height*(1-2*i)};
}
export function rectTouchesGroveClearing(rect:Rect,point:{x:number;y:number},padding=0) {
  return Math.hypot(Math.max(rect.x-point.x,0,point.x-rect.x-rect.width)/(CONFIG.clearingRadiusX+padding),
    Math.max(rect.y-point.y,0,point.y-rect.y-rect.height)/(CONFIG.clearingRadiusY+padding))<=1;
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
  const species=mushrooms.sprites.length;
  const variants=Array.from({length:count},(_,i)=>i<species?i:Math.floor(random()*species));
  for(let i=count-1;i>0;i--){const j=Math.floor(random()*(i+1));[variants[i],variants[j]]=[variants[j],variants[i]];}
  const rotation=random()*Math.PI*2;
  return {x,y,version:2,mushrooms:variants.map((variant,i)=>{
    const angle=rotation+i*Math.PI*2/count+(random()*2-1)*Math.PI/count*.18;
    const radius=1+(random()*2-1)*CONFIG.radialJitter/CONFIG.radiusX;
    return {x:Math.round(x+Math.cos(angle)*CONFIG.radiusX*radius),y:Math.round(y+Math.sin(angle)*CONFIG.radiusY*radius),variant,
      height:CONFIG.ringHeight.min+random()*(CONFIG.ringHeight.max-CONFIG.ringHeight.min)};
  })};
}

/** Keep existing trees except those newly excluded by the grove/circle. */
export function prepareWitchGrove(layout:MeadowLayout,protectedActors:readonly Rect[]=[]):boolean {
  let changed=false;
  if(layout.witchCircle?.version!==2){layout.witchCircle=generateWitchCircle(layout);changed=true;}
  const circle=layout.witchCircle;
  const excluded=(tree:ObstaclePlacement)=>treeInGroveCenter(layout,tree)||
    rectTouchesGroveClearing(obstacleVisualRect(tree),circle,8);
  const grove=layout.obstacles.filter(t=>roomAt(layout,t)===CONFIG.roomId);
  const crowded=grove.some((a,i)=>grove.slice(0,i).some(b=>Math.hypot(a.x-b.x,a.y-b.y)<CONFIG.treeSpacing-.01));
  const rebuild=changed||crowded;
  const moving=layout.obstacles.flatMap((tree,index)=>(excluded(tree)||(rebuild&&roomAt(layout,tree)===CONFIG.roomId))?[index]:[]);
  if(!moving.length)return changed;
  const indices=new Set(moving),kept=layout.obstacles.filter((_,i)=>!indices.has(i));
  const reserved=[...protectedActors,...(layout.logs??[]).map(logVisualRect),
    ...(layout.stump?[stumpClearing(layout.stump)]:[]),
    ...(layout.rooms??[]).flatMap(room=>room.tree?[ritualTreeClearing(room.tree)]:[]),
    {x:layout.spawn.x-80,y:layout.spawn.y-80,width:160,height:160}];
  const random=seededRandom(layout.seed^0x47524f56);
  const originals=moving.map(index=>({...layout.obstacles[index]}));
  // Rotate the side order for each seed; round-robin placement prevents one
  // randomly crowded edge. Retry the whole arrangement if a late tree cannot fit.
  // The horizontal sides are longer, so they receive twice as many slots.
  const sides=[2,0,3,2,1,3];for(let i=sides.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[sides[i],sides[j]]=[sides[j],sides[i]];}
  for(let restart=0;restart<24;restart++){
    const accepted=[...kept];let groveIndex=0,complete=true;
    for(let n=0;n<moving.length;n++){
      const index=moving[n],original=originals[n],id=roomAt(layout,original),room=roomBounds(layout,id);
      const side=sides[groveIndex%sides.length];if(id===CONFIG.roomId)groveIndex++;
      let placed=false;
      for(let attempt=0;attempt<4000;attempt++){
        let x=room.x+24+random()*(room.width-48),y=room.y+24+random()*(room.height-48);
        if(id===CONFIG.roomId){
          const edge=attempt<2000?side:(side+Math.floor((attempt-2000)/100))%4;
          if(edge===0)x=room.x+24+random()*(room.width*CONFIG.interiorInset-24);
          if(edge===1)x=room.x+room.width*(1-CONFIG.interiorInset)+random()*(room.width*CONFIG.interiorInset-24);
          if(edge===2)y=room.y+24+random()*(room.height*CONFIG.interiorInset-24);
          if(edge===3)y=room.y+room.height*(1-CONFIG.interiorInset)+random()*(room.height*CONFIG.interiorInset-24);
        }
        const p={...original,x,y},v=obstacleVisualRect(p),body=obstacleRect(p);
        if(v.x<3||v.y<3||v.x+v.width>layout.width-3||v.y+v.height>layout.height-3||excluded(p))continue;
        if(reserved.some(r=>overlaps(v,r,24))||accepted.some(t=>overlaps(body,obstacleRect(t),28)))continue;
        if(id===CONFIG.roomId&&accepted.some(t=>roomAt(layout,t)===CONFIG.roomId&&Math.hypot(t.x-x,t.y-y)<CONFIG.treeSpacing))continue;
        layout.obstacles[index]=p;accepted.push(p);placed=true;break;
      }
      if(!placed){complete=false;break;}
    }
    if(complete)return true;
  }
  throw new Error('Не удалось равномерно разместить деревья опушки');
}
