import { WITCH_CIRCLE } from '../data/witchCircle';
import type { WitchCirclePlacement } from '../world/witchGrove';
import type { FloorRaster } from '../world/forestFloor';
import { seededRandom } from '../world/random';

/** Replace blades and flowers inside the ring, keeping the surrounding grass exact. */
export function paintWitchCircleSoil(raster:FloorRaster,circle:WitchCirclePlacement,scale:number,seed:number){
  const radius=WITCH_CIRCLE.radius,random=seededRandom(seed^0x534f494c);
  const palette=[[65,58,44],[70,62,46],[75,67,48],[59,53,41]];
  for(let y=Math.max(0,Math.floor((circle.y-radius)/scale));y<Math.min(raster.height,Math.ceil((circle.y+radius)/scale));y++)
    for(let x=Math.max(0,Math.floor((circle.x-radius)/scale));x<Math.min(raster.width,Math.ceil((circle.x+radius)/scale));x++){
      if(Math.hypot((x+.5)*scale-circle.x,(y+.5)*scale-circle.y)>radius)continue;
      const ticket=random(),color=palette[ticket<.65?0:ticket<.8?1:ticket<.92?2:3],p=y*raster.width+x;
      raster.pixels.set([...color,255],p*4);
      if(raster.grassHeights)raster.grassHeights[p]=0;
    }
}
