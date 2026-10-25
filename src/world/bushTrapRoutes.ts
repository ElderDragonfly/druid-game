import { segmentTouchesEllipse } from '../physics/ellipse';
import type { Point } from '../physics/projectileSweep';
import { WITCH_CIRCLE } from '../data/witchCircle';
import { BUSH_TRAPS } from '../data/bushTraps';
import { bushVisualRect, type BushPlacement } from './bushes';

export function bushCenter(bush:BushPlacement):Point {
  const r=bushVisualRect(bush);return {x:r.x+r.width/2,y:r.y+r.height/2};
}
export function inWitchSanctuary(point:Point,center:Point) {
  return Math.hypot((point.x-center.x)/WITCH_CIRCLE.radiusX,(point.y-center.y)/WITCH_CIRCLE.radiusY)<=1;
}

/** Visibility graph around a padded oval. Every segment, including turns,
 * stays outside the sanctuary; other objects deliberately don't block it. */
export function bushTrapRoute(from:Point,to:Point,center:Point):Point[] {
  const rx=WITCH_CIRCLE.radiusX+BUSH_TRAPS.radius+8,ry=WITCH_CIRCLE.radiusY+BUSH_TRAPS.radius+8;
  const clear=(a:Point,b:Point)=>!segmentTouchesEllipse(a,b,center,rx,ry);
  if(!clear(from,from)||!clear(to,to))return [];
  if(clear(from,to))return [{...from},{...to}];
  const nodes=[from,to,...Array.from({length:16},(_,i)=>{
    const a=i*Math.PI/8;return {x:center.x+Math.cos(a)*rx*1.05,y:center.y+Math.sin(a)*ry*1.05};
  })];
  const distances=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),visited=new Set<number>();distances[0]=0;
  for(let step=0;step<nodes.length;step++){
    let current=-1;
    for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&(current<0||distances[i]<distances[current]))current=i;
    if(current<0||!Number.isFinite(distances[current]))return [];
    if(current===1)break;
    visited.add(current);
    for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&clear(nodes[current],nodes[i])){
      const d=distances[current]+Math.hypot(nodes[current].x-nodes[i].x,nodes[current].y-nodes[i].y);
      if(d<distances[i]){distances[i]=d;previous[i]=current;}
    }
  }
  if(previous[1]<0)return [];
  const path:Point[]=[];for(let i=1;i>=0;i=previous[i])path.unshift({...nodes[i]});return path;
}

export function routeLength(path:readonly Point[]) {
  return path.slice(1).reduce((total,p,i)=>total+Math.hypot(p.x-path[i].x,p.y-path[i].y),0);
}
export function routePosition(path:readonly Point[],distance:number):Point {
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.y-a.y);
    if(distance<=length){const t=length?Math.max(0,distance)/length:0;return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
    distance-=length;
  }
  return {...path[path.length-1]};
}
