import type { FloorRaster } from '../world/forestFloor';
import { FOREST_FLOOR } from '../world/forestFloor';
import type { MeadowLayout } from '../world/meadowLayout';

const clamp=(v:number)=>Math.max(0,Math.min(1,v));
function hash(x:number,y:number,seed:number){
  let n=Math.imul(x,374761393)^Math.imul(y,668265263)^seed;
  n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;
}
function noise(x:number,y:number,seed:number){
  const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy;
  const a=u*u*(3-2*u),b=v*v*(3-2*v);
  return (hash(ix,iy,seed)*(1-a)+hash(ix+1,iy,seed)*a)*(1-b)+
    (hash(ix,iy+1,seed)*(1-a)+hash(ix+1,iy+1,seed)*a)*b;
}
/** Baked once per room creation; no overlay, animation or repeated tile. */
export function applySkeletonClearing(raster:FloorRaster,layout:MeadowLayout){
  const s=FOREST_FLOOR.pixelScale,w=Math.ceil(layout.width/3/s),h=Math.ceil(layout.height/3/s);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const wx=x*s,wy=y*s,d=Math.min(layout.width/3-wx,layout.height/3-wy);
    const patch=noise(wx/72,wy/72,layout.seed^0x434c4541);
    const blend=clamp((d-35+(patch-.5)*65)/95);if(!blend)continue;
    const i=(y*raster.width+x)*4,old=[raster.pixels[i],raster.pixels[i+1],raster.pixels[i+2]];
    const green=clamp((patch-.68)/.12),dryWeight=blend*(1-green);
    const luma=old[0]*.3+old[1]*.55+old[2]*.15;
    const dry=[luma*.7+19,luma*.64+13,luma*.4+12];
    // Keep every blade and the exact foreground mask, changing only its color.
    for(let c=0;c<3;c++)raster.pixels[i+c]=Math.round(old[c]*(1-dryWeight)+dry[c]*dryWeight);
  }
}
