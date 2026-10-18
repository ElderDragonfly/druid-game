import type Phaser from 'phaser';

export const CARDINAL_FACINGS = ['down', 'left', 'right', 'up'] as const;
export const FACINGS = [...CARDINAL_FACINGS, 'down-left', 'down-right', 'up-left', 'up-right'] as const;
export type CardinalFacing = typeof CARDINAL_FACINGS[number];
export type Facing = typeof FACINGS[number];
export type MovementKeys = Record<CardinalFacing, Phaser.Input.Keyboard.Key>;

/** A unit vector keeps diagonal projectiles as fast as cardinal ones. */
export function facingVector(facing: Facing): { x: number; y: number } {
  const x = facing.includes('left') ? -1 : facing.includes('right') ? 1 : 0;
  const y = facing.includes('up') ? -1 : facing.includes('down') ? 1 : 0;
  const length = Math.hypot(x, y);
  return { x: x / length, y: y / length };
}

export function facingFromVector(x: number, y: number): Facing | undefined {
  if (x && y) return `${y < 0 ? 'up' : 'down'}-${x < 0 ? 'left' : 'right'}`;
  if (x) return x < 0 ? 'left' : 'right';
  if (y) return y < 0 ? 'up' : 'down';
  return undefined;
}

// The same resultant input vector chooses velocity and the eight-way pose.
// Opposite keys cancel; no input retains the last view for the idle pose.
export class EightWayFacing {
  private facing: Facing = 'down';

  constructor(private keys: MovementKeys) {}

  read(): Facing {
    const x = Number(this.keys.right.isDown) - Number(this.keys.left.isDown);
    const y = Number(this.keys.down.isDown) - Number(this.keys.up.isDown);
    this.facing = facingFromVector(x, y) ?? this.facing;
    return this.facing;
  }
}
