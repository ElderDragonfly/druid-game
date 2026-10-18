import { ACORN } from '../data/acorn';
import type { Point } from '../physics/projectileSweep';

/** The range stat scales an ellipse on the ground; height is a separate arc. */
export class AcornFlight {
  readonly maxDistance: number;
  readonly descentDistance: number;
  distance = 0;

  constructor(direction: Point, range: number) {
    const multiplier=Number.isFinite(range)?Math.max(0,range):0;
    this.maxDistance=multiplier/Math.hypot(direction.x/ACORN.rangeX,direction.y/ACORN.rangeY);
    this.descentDistance=Math.min(this.maxDistance,ACORN.speed*ACORN.descentMs/1000);
  }

  get remaining() { return Math.max(0,this.maxDistance-this.distance); }

  heightAt(distance: number) {
    if(this.maxDistance<=0)return 0;
    const t=Math.max(0,Math.min(1,(distance-(this.maxDistance-this.descentDistance))/this.descentDistance));
    return ACORN.flightHeight*(1-t*t);
  }

  get height() { return this.heightAt(this.distance); }
}
