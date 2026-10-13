import type Phaser from 'phaser';

export type Facing = 'up' | 'down' | 'left' | 'right';
export type MovementKeys = Record<Facing, Phaser.Input.Keyboard.Key>;

// Поворот зависит от ввода, даже если движение остановлено препятствием.
export class FourWayFacing {
  private facing: Facing = 'down';
  private sequence = 0;
  private pressed: Record<Facing, number> = { up: 0, down: 0, left: 0, right: 0 };
  private listeners: Array<{ key: Phaser.Input.Keyboard.Key; handler: () => void }> = [];

  constructor(private keys: MovementKeys) {
    for (const direction of ['up', 'down', 'left', 'right'] as const) {
      const key = keys[direction];
      const handler = () => { this.pressed[direction] = ++this.sequence; };
      key.on('down', handler);
      this.listeners.push({ key, handler });
    }
  }

  read(): Facing {
    const horizontal = Number(this.keys.right.isDown) - Number(this.keys.left.isDown);
    const vertical = Number(this.keys.down.isDown) - Number(this.keys.up.isDown);
    const candidates: Facing[] = [];
    if (horizontal) candidates.push(horizontal > 0 ? 'right' : 'left');
    if (vertical) candidates.push(vertical > 0 ? 'down' : 'up');
    if (candidates.length) {
      this.facing = candidates.reduce((latest, direction) =>
        this.pressed[direction] > this.pressed[latest] ? direction : latest);
    }
    return this.facing;
  }

  destroy() {
    for (const { key, handler } of this.listeners) key.off('down', handler);
    this.listeners = [];
  }
}
