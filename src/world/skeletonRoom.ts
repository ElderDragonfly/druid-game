import { SKELETON,SKELETON_ROOM as CONFIG } from '../data/skeleton';
import bones from '../../docs/art/skeleton-room-v1/bones.json';
import type { MeadowLayout } from './meadowLayout';
import { obstacleRect,obstacleVisualRect } from './meadowLayout';
import { roomBounds,ritualTreeClearing } from './rooms';
import { overlaps,type Rect } from './geometry';
import { seededRandom } from './random';
import { WolfNavigation,type WolfPoint } from './WolfNavigation';
import { invalidateLayoutCollisionRects } from './collision';
import { environmentVariant } from '../data/environment';
import { stumpClearing } from './stump';
import { logVisualRect } from './fallenLogs';

export interface BonePlacement{x:number;y:number;variant:number}
export function boneRect(p:BonePlacement){
  const b=bones.sprites[p.variant],s=CONFIG.boneScale;
  return {x:p.x-b.width*s/2,y:p.y-b.height*s,width:b.width*s,height:b.height*s};
}
/** Also upgrades an older run without changing its actors or collected items. */
export function prepareSkeletonRoom(layout:MeadowLayout,protectedActors:readonly Rect[]=[]){
  const room=roomBounds(layout,CONFIG.roomId);
  const moving=layout.obstacles.filter(tree=>overlaps(obstacleVisualRect(tree),room));
  const kept=layout.obstacles.filter(tree=>!overlaps(obstacleVisualRect(tree),room));
  const randomTrees=seededRandom(layout.seed^0x424f4e54);
  const reserved=[room,roomBounds(layout,3),...protectedActors,...(layout.logs??[]).map(logVisualRect),
    ...(layout.stump?[stumpClearing(layout.stump)]:[]),
    ...(layout.rooms??[]).flatMap(r=>r.tree?[ritualTreeClearing(r.tree)]:[]),
    {x:layout.spawn.x-80,y:layout.spawn.y-100,width:160,height:180}];
  for(const original of moving){
    const a=environmentVariant(original.kind,original.variant);
    let placed=false;
    for(let attempt=0;attempt<8000;attempt++){
      const p={...original,x:a.anchorX*a.scale+4+randomTrees()*(layout.width-a.width*a.scale-8),
        y:a.anchorY*a.scale+4+randomTrees()*(layout.height-a.height*a.scale-8)};
      const visual=obstacleVisualRect(p),body=obstacleRect(p);
      if(reserved.some(r=>overlaps(visual,r,24))||kept.some(t=>overlaps(body,obstacleRect(t),28)))continue;
      Object.assign(original,p);kept.push(original);placed=true;break;
    }
    if(!placed)throw new Error('Не удалось освободить комнату скелетов');
  }
  layout.counts.trees=layout.obstacles.length;
  if(moving.length)invalidateLayoutCollisionRects(layout);
  if(layout.rooms)layout.rooms[CONFIG.roomId].scenario='skeletons';
  if(layout.bones)return;
  const random=seededRandom(layout.seed^0x424f4e45);
  const count=CONFIG.bones.min+Math.floor(random()*(CONFIG.bones.max-CONFIG.bones.min+1));
  layout.bones=[];
  for(let attempt=0;layout.bones.length<count&&attempt<4000;attempt++){
    const p={x:room.x+60+random()*(room.width-120),y:room.y+60+random()*(room.height-120),
      variant:Math.floor(random()*bones.sprites.length)};
    if(layout.bones.every(other=>!overlaps(boneRect(p),boneRect(other),20)))layout.bones.push(p);
  }
  if(layout.bones.length!==count)throw new Error('Не удалось разместить кости');
}

export function generateSkeletonPopulation(layout:MeadowLayout):WolfPoint[]{
  const room=roomBounds(layout,CONFIG.roomId),random=seededRandom(layout.seed^0x534b454c);
  const navigation=new WolfNavigation(layout,SKELETON.body);
  const count=CONFIG.enemies.min+Math.floor(random()*(CONFIG.enemies.max-CONFIG.enemies.min+1)),result:WolfPoint[]=[];
  for(let attempt=0;result.length<count&&attempt<2000;attempt++){
    const p={x:room.x+90+random()*(room.width-180),y:room.y+110+random()*(room.height-200)};
    if(navigation.canStand(p)&&result.every(other=>Math.hypot(p.x-other.x,p.y-other.y)>=CONFIG.spacing))result.push(p);
  }
  if(result.length!==count)throw new Error('Не удалось разместить скелетов');
  return result;
}
