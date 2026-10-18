import type { Point } from './projectileSweep';

/** Swept detection catches a fast shot crossing the oval between two frames. */
export function segmentTouchesEllipse(from: Point, to: Point, center: Point, radiusX: number, radiusY: number) {
  const x=(from.x-center.x)/radiusX,y=(from.y-center.y)/radiusY;
  const dx=(to.x-from.x)/radiusX,dy=(to.y-from.y)/radiusY;
  const length=dx*dx+dy*dy;
  const t=length ? Math.max(0,Math.min(1,-(x*dx+y*dy)/length)) : 0;
  return (x+dx*t)**2+(y+dy*t)**2<=1;
}
