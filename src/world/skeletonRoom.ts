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
import rockArt from '../../docs/art/sprouts-rocks-v1/art.json';

export interface BonePlacement{x:number;y:number;variant:number;kind?:'rock'}
export const ROOM_ROCK_SCALE=.24;
export function boneRect(p:BonePlacement){
  const b=p.kind==='rock'?rockArt.rocks[p.variant]:bones.sprites[p.variant],s=p.kind==='rock'?ROOM_ROCK_SCALE:CONFIG.boneScale;
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
  if(layout.bones){prepareRockDecor(layout);return;}
  const random=seededRandom(layout.seed^0x424f4e45);
  const count=CONFIG.bones.min+Math.floor(random()*(CONFIG.bones.max-CONFIG.bones.min+1));
  layout.bones=[];
  for(let attempt=0;layout.bones.length<count&&attempt<4000;attempt++){
    const p={x:room.x+60+random()*(room.width-120),y:room.y+60+random()*(room.height-120),
      variant:Math.floor(random()*bones.sprites.length)};
    if(layout.bones.every(other=>!overlaps(boneRect(p),boneRect(other),20)))layout.bones.push(p);
  }
  if(layout.bones.length!==count)throw new Error('Не удалось разместить кости');
  prepareRockDecor(layout);
}

function prepareRockDecor(layout:MeadowLayout){
  if(layout.boneDecorVersion===2)return;
  const random=seededRandom(layout.seed^0x524f434b),room=roomBounds(layout,CONFIG.roomId),items=layout.bones!;
  for(let i=2;i<items.length;i+=3){
    const p=items[i];p.kind='rock';p.variant=Math.floor(random()*rockArt.rocks.length);
    let placed=false;
    for(let n=0;n<4000;n++){
      if(n){p.x=room.x+55+random()*(room.width-110);p.y=room.y+60+random()*(room.height-120);}
      const r=boneRect(p);
      if(items.every((other,j)=>i===j||!overlaps(r,boneRect(other),20))){placed=true;break;}
    }
    if(!placed)throw new Error('Не удалось разместить камни вместо части костей');
  }
  layout.boneDecorVersion=2;
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
