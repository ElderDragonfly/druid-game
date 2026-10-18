import type { Rect } from '../world/meadowLayout';

export interface Point { x: number; y: number }

/** Segment vs radius-expanded footprint: detects thin obstacles even at low FPS. */
export function sweptRect(from: Point, to: Point, rect: Rect, radius: number): number | undefined {
  let enter=0,exit=1;
  for(const [a,d,low,high] of [
    [from.x,to.x-from.x,rect.x-radius,rect.x+rect.width+radius],
    [from.y,to.y-from.y,rect.y-radius,rect.y+rect.height+radius],
  ]) {
    if(Math.abs(d)<1e-9) { if(a<low||a>high)return; }
    else {
      const t1=(low-a)/d,t2=(high-a)/d;
      enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));
      if(enter>exit)return;
    }
  }
  return enter;
}

export function worldExit(from: Point, to: Point, bounds: Rect, radius: number): number | undefined {
  const left=bounds.x+radius,right=bounds.x+bounds.width-radius;
  const top=bounds.y+radius,bottom=bounds.y+bounds.height-radius;
  if(from.x<left||from.x>right||from.y<top||from.y>bottom)return 0;
  let t=Infinity;
  if(to.x<left)t=Math.min(t,(left-from.x)/(to.x-from.x));
  if(to.x>right)t=Math.min(t,(right-from.x)/(to.x-from.x));
  if(to.y<top)t=Math.min(t,(top-from.y)/(to.y-from.y));
  if(to.y>bottom)t=Math.min(t,(bottom-from.y)/(to.y-from.y));
  return Number.isFinite(t)?t:undefined;
}
