import { WOLF } from '../data/wolf';
import { seededRandom } from './meadowLayout';
import type { WolfNavigation, WolfPoint } from './WolfNavigation';
import { ROOM_SCENARIOS } from '../data/roomScenarios';
import { roomBounds } from './rooms';

/** One world-wide draw, no sector quotas. Keep the initial player spawn safe. */
export function generateWolfPopulation(navigation: WolfNavigation): WolfPoint[] {
  const {layout}=navigation,config=WOLF.population;
  const room=layout.rooms?.find(room=>room.scenario==='wolves');
  if(layout.rooms&&!room)return [];
  const limits=room?ROOM_SCENARIOS.wolves.wolves:config;
  const bounds=room?roomBounds(layout,room.id):{x:0,y:0,width:layout.width,height:layout.height};
  const random=seededRandom(layout.seed^0x574f4c50);
  const count=limits.min+Math.floor(random()*(limits.max-limits.min+1));
  const points: WolfPoint[]=[];
  const player={x:layout.spawn.x,y:layout.spawn.y+22.5};
  for(let attempt=0;attempt<4096&&points.length<count;attempt++) {
    const p={x:bounds.x+48+random()*(bounds.width-96),y:bounds.y+48+random()*(bounds.height-96)};
    const nearPlayer=((p.x-player.x)/WOLF.behavior.detectionX)**2+((p.y-player.y)/WOLF.behavior.detectionY)**2<=1;
    if(!nearPlayer&&navigation.canStand(p)&&
      points.every(other=>Math.hypot(other.x-p.x,other.y-p.y)>=config.spacing)&&
      navigation.route(p,player).length)points.push(p);
  }
  if(room&&points.length!==count)throw new Error('Не удалось разместить волков сценария');
  return points;
}
