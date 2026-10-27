import { FOREST_SPROUT as CONFIG } from '../data/forestSprout';
import { ACTIVE_BUSH_VARIANT } from '../data/bushes';
import type { MeadowLayout } from './meadowLayout';
import { obstacleVisualRect } from './meadowLayout';
import { roomBounds } from './rooms';
import { seededRandom } from './random';
import { layoutCollisionRects } from './collision';
import { bushVisualRect,type BushPlacement } from './bushes';
import { overlaps,type Rect } from './geometry';

export interface SproutPlacement{x:number;y:number;variant:number}
export interface SproutRoomPlacement{enemies:SproutPlacement[];bushes:BushPlacement[]}
/** Separate streams preserve the accepted trap bushes and other room events. */
export function prepareSproutRoom(layout:MeadowLayout,protectedActors:readonly Rect[]=[]){
  if(layout.rooms)layout.rooms[CONFIG.roomId].scenario='sprouts';
  if(layout.sproutRoom)return;
  const room=roomBounds(layout,CONFIG.roomId),random=seededRandom(layout.seed^0x53505254);
  const trunks=layoutCollisionRects(layout),enemies:SproutPlacement[]=[],bushes:BushPlacement[]=[];
  const point=()=>({x:room.x+90+random()*(room.width-180),y:room.y+100+random()*(room.height-180)});
  for(let attempt=0;enemies.length<CONFIG.count&&attempt<5000;attempt++){
    const p={...point(),variant:enemies.length<4?enemies.length:Math.floor(random()*4)};
    if(trunks.some(r=>overlaps({x:p.x-CONFIG.body.width/2,y:p.y-CONFIG.body.height,...CONFIG.body},r,18))||
      protectedActors.some(r=>overlaps({x:p.x-45,y:p.y-70,width:90,height:85},r,12))||
      enemies.some(other=>Math.hypot(p.x-other.x,p.y-other.y)<CONFIG.spacing))continue;
    enemies.push(p);
  }
  if(enemies.length!==CONFIG.count)throw new Error('Не удалось разместить шесть ростков');
  const count=CONFIG.bushes.min+Math.floor(random()*(CONFIG.bushes.max-CONFIG.bushes.min+1));
  for(let attempt=0;bushes.length<count&&attempt<8000;attempt++){
    const p={...point(),variant:ACTIVE_BUSH_VARIANT},r=bushVisualRect(p);
    if(protectedActors.some(a=>overlaps(r,a,12))||bushes.some(b=>overlaps(r,bushVisualRect(b),12))||
      enemies.some(e=>overlaps(r,{x:e.x-38,y:e.y-72,width:76,height:78},10))||
      (attempt<4000&&layout.obstacles.some(t=>overlaps(r,obstacleVisualRect(t),8)))||
      trunks.some(t=>overlaps(r,t,8)))continue;
    bushes.push(p);
  }
  if(bushes.length!==count)throw new Error('Не удалось разместить кусты комнаты ростков');
  layout.sproutRoom={enemies,bushes};
}
