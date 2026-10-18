import { WOLF } from '../data/wolf';
import { seededRandom } from './meadowLayout';
import type { WolfNavigation, WolfPoint } from './WolfNavigation';

/** One world-wide draw, no sector quotas. Keep the initial player spawn safe. */
export function generateWolfPopulation(navigation: WolfNavigation): WolfPoint[] {
  const {layout}=navigation,config=WOLF.population;
  const random=seededRandom(layout.seed^0x574f4c50);
  const count=config.min+Math.floor(random()*(config.max-config.min+1));
  const points: WolfPoint[]=[];
  const player={x:layout.spawn.x,y:layout.spawn.y+22.5};
  for(let attempt=0;attempt<4096&&points.length<count;attempt++) {
    const p={x:32+random()*(layout.width-64),y:32+random()*(layout.height-64)};
    const nearPlayer=((p.x-player.x)/WOLF.behavior.detectionX)**2+((p.y-player.y)/WOLF.behavior.detectionY)**2<=1;
    if(!nearPlayer&&navigation.canStand(p)&&
      points.every(other=>Math.hypot(other.x-p.x,other.y-p.y)>=config.spacing)&&
      navigation.route(p,player).length)points.push(p);
  }
  return points;
}
