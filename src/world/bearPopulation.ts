import { BEAR } from '../data/bear';
import { WolfNavigation,type WolfPoint } from './WolfNavigation';
import { obstacleVisualRect,type MeadowLayout } from './meadowLayout';
import { roomBounds } from './rooms';
import { overlaps } from './geometry';
import { seededRandom } from './random';
/** Exactly one sleeping bear in room 6, independent from other random streams. */
export function generateBearSpawn(layout:MeadowLayout):WolfPoint|undefined {
 if(layout.rooms?.[6].scenario!=='bear')return undefined;
 const random=seededRandom(layout.seed^0x4253504e),bounds=roomBounds(layout,6),navigation=new WolfNavigation(layout,BEAR.body);
 const fallbacks:{point:WolfPoint;coverage:number}[]=[];
 for(let attempt=0;attempt<2048;attempt++){
  const p={x:bounds.x+110+random()*(bounds.width-220),y:bounds.y+130+random()*(bounds.height-240)};
  if(!navigation.canStand(p,24))continue;
  const visible={x:p.x-85,y:p.y-115,width:170,height:130};
  const canopies=layout.obstacles.map(obstacleVisualRect).filter(r=>overlaps(visible,r,8));
  if(canopies.length){
   const coverage=canopies.reduce((sum,r)=>sum+
    Math.max(0,Math.min(visible.x+visible.width,r.x+r.width+8)-Math.max(visible.x,r.x-8))*
    Math.max(0,Math.min(visible.y+visible.height,r.y+r.height+8)-Math.max(visible.y,r.y-8)),0);
   fallbacks.push({point:p,coverage});continue;
  }
  if(!navigation.route(p,layout.spawn).length)continue;
  return p;
 }
 // Dense canopies may cover every valid point even though the trunks leave
 // plenty of walkable ground. Keep physical clearance and a real route.
 fallbacks.sort((a,b)=>a.coverage-b.coverage);
 for(const candidate of fallbacks)if(navigation.route(candidate.point,layout.spawn).length)return candidate.point;
 throw new Error('Не удалось разместить спящего медведя');
}
