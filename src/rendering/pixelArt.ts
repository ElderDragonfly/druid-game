import Phaser from 'phaser';

// Фигуры строятся из целых пикселей. Кривые не сглаживаются при увеличении.
export class PixelArt {
  constructor(readonly graphics: Phaser.GameObjects.Graphics) {}

  rect(color: number, x: number, y: number, width = 1, height = 1) {
    this.graphics.fillStyle(color).fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  }

  ellipse(color: number, x: number, y: number, rx: number, ry: number) {
    for (let row = Math.ceil(-ry); row <= Math.floor(ry); row++) {
      const span = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (row / ry) ** 2)));
      this.rect(color, x - span, y + row, span * 2 + 1, 1);
    }
  }

  line(color: number, x1: number, y1: number, x2: number, y2: number, thickness = 1) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      this.rect(color, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, thickness, thickness);
    }
  }
}

export const MEADOW_PALETTE = {
  ground: 0x263d30,
  groundShades: [0x20362b, 0x2b4433, 0x304a35, 0x344d36],
  forestShadow: 0x192e25,
} as const;
