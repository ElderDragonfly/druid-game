import { WITCH_CIRCLE as CONFIG } from '../data/witchCircle';
import type { WitchCirclePlacement } from '../world/witchGrove';
import type { FloorRaster } from '../world/forestFloor';
import { seededRandom } from '../world/random';

/** A low-frequency boundary keeps the blot rounded, without sharp ink-like spikes. */
export function witchSoilCoverage(x:number,y:number,circle:{x:number;y:number},seed:number){
  const random=seededRandom(seed^0x534f494c),a=random()*Math.PI*2,b=random()*Math.PI*2,c=random()*Math.PI*2;
  return soilCoverage(x,y,circle,a,b,c);
}
function soilCoverage(x:number,y:number,circle:{x:number;y:number},a:number,b:number,c:number){
  const dx=(x-circle.x)/CONFIG.radiusX,dy=(y-circle.y)/CONFIG.radiusY,angle=Math.atan2(dy,dx);
  const boundary=.91+.07*Math.sin(3*angle+a)+.045*Math.cos(5*angle+b)+.025*Math.sin(7*angle+c);
  const t=Math.max(0,Math.min(1,(boundary-Math.hypot(dx,dy))/(CONFIG.soilFeather/CONFIG.radiusX)+.5));
  return t*t*(3-2*t);
}
/** Sample the uploaded soil once across the blot, blending only its irregular rim. */
export function paintWitchCircleSoil(raster:FloorRaster,circle:WitchCirclePlacement,scale:number,seed:number,soil:FloorRaster){
  const random=seededRandom(seed^0x534f494c),a=random()*Math.PI*2,b=random()*Math.PI*2,c=random()*Math.PI*2;
  const rx=CONFIG.radiusX*CONFIG.soilExtent,ry=CONFIG.radiusY*CONFIG.soilExtent;
  for(let y=Math.max(0,Math.floor((circle.y-ry)/scale));y<Math.min(raster.height,Math.ceil((circle.y+ry)/scale));y++)
    for(let x=Math.max(0,Math.floor((circle.x-rx)/scale));x<Math.min(raster.width,Math.ceil((circle.x+rx)/scale));x++){
      const wx=(x+.5)*scale,wy=(y+.5)*scale,alpha=soilCoverage(wx,wy,circle,a,b,c);
      if(!alpha)continue;
      const sx=Math.max(0,Math.min(soil.width-1,Math.floor((wx-circle.x+rx)/(2*rx)*soil.width)));
      const sy=Math.max(0,Math.min(soil.height-1,Math.floor((wy-circle.y+ry)/(2*ry)*soil.height)));
      const from=(sy*soil.width+sx)*4,p=y*raster.width+x,to=p*4;
      for(let channel=0;channel<3;channel++)raster.pixels[to+channel]=Math.round(raster.pixels[to+channel]*(1-alpha)+soil.pixels[from+channel]*alpha);
      raster.pixels[to+3]=255;
      if(raster.grassHeights)raster.grassHeights[p]=0;
    }
}
