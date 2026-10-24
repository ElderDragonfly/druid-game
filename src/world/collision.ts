import { stumpRect } from './stump';
import { ritualTreeRect } from './rooms';
import { obstacleRect, type MeadowLayout } from './meadowLayout';
import { logCollisionRects } from './fallenLogs';
import type { Rect } from './geometry';
const cache = new WeakMap<MeadowLayout, readonly Rect[]>();
/** Layout geometry is fixed for a run; actor stats can change independently. */
export function layoutCollisionRects(layout: MeadowLayout): readonly Rect[] {
  let rects=cache.get(layout);
  if(!rects) {
    rects=[...layout.obstacles.map(obstacleRect),...(layout.logs??[]).flatMap(logCollisionRects),...(layout.stump?[stumpRect(layout.stump)]:[]),
      ...(layout.rooms??[]).flatMap(room=>room.tree?[ritualTreeRect(room.tree)]:[])];
    cache.set(layout,rects);
  }
  return rects;
}

export function invalidateLayoutCollisionRects(layout: MeadowLayout) { cache.delete(layout); }
