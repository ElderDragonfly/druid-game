import type { Facing } from '../input/EightWayFacing';

export interface DruidState {
  health: number;
  maxHealth: number;
  speed: number;
  facing: Facing;
}

/** Movement reads mutable instance stats; animation follows unobstructed travel. */
export class DruidMovement {
  constructor(readonly state: DruidState) {}

  velocity(x: number, y: number, facing: Facing) {
    this.state.facing = facing;
    const factor = Math.max(0, this.state.speed) / (Math.hypot(x, y) || 1);
    return { x: x * factor, y: y * factor };
  }

  travelSpeed(velocity: { x: number; y: number }, blocked: { left: boolean; right: boolean; up: boolean; down: boolean }) {
    const x = (velocity.x < 0 && blocked.left) || (velocity.x > 0 && blocked.right) ? 0 : velocity.x;
    const y = (velocity.y < 0 && blocked.up) || (velocity.y > 0 && blocked.down) ? 0 : velocity.y;
    return Math.hypot(x, y);
  }
}
