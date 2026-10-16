import type Phaser from 'phaser';

export const CARDINAL_FACINGS = ['down', 'left', 'right', 'up'] as const;
export const FACINGS = [...CARDINAL_FACINGS, 'down-left', 'down-right', 'up-left', 'up-right'] as const;
export type CardinalFacing = typeof CARDINAL_FACINGS[number];
export type Facing = typeof FACINGS[number];
export type MovementKeys = Record<CardinalFacing, Phaser.Input.Keyboard.Key>;

// The same resultant input vector chooses velocity and the eight-way pose.
// Opposite keys cancel; no input retains the last view for the idle pose.
export class EightWayFacing {
  private facing: Facing = 'down';

  constructor(private keys: MovementKeys) {}

  read(): Facing {
    const x = Number(this.keys.right.isDown) - Number(this.keys.left.isDown);
    const y = Number(this.keys.down.isDown) - Number(this.keys.up.isDown);
    if (x && y) this.facing = `${y < 0 ? 'up' : 'down'}-${x < 0 ? 'left' : 'right'}`;
    else if (x) this.facing = x < 0 ? 'left' : 'right';
    else if (y) this.facing = y < 0 ? 'up' : 'down';
    return this.facing;
  }
}
