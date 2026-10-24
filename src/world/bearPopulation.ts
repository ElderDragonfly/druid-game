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
 for(let attempt=0;attempt<2048;attempt++){
  const p={x:bounds.x+110+random()*(bounds.width-220),y:bounds.y+130+random()*(bounds.height-240)};
  if(!navigation.canStand(p,24))continue;
  const visible={x:p.x-85,y:p.y-115,width:170,height:130};
  if(layout.obstacles.some(o=>overlaps(visible,obstacleVisualRect(o),8)))continue;
  if(!navigation.route(p,layout.spawn).length)continue;
  return p;
 }
 throw new Error('Не удалось разместить спящего медведя');
}
