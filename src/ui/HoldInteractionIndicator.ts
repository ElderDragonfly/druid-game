import Phaser from 'phaser';

/** World-space prompt follows the actor, independent of the interaction target. */
export class HoldInteractionIndicator extends Phaser.GameObjects.Container {
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly key: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.ring = scene.make.graphics({ x: 0, y: 0 }, false);
    this.key = scene.make.text({ x: 0, y: 0, text: 'E', style: {
      fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: '#f0e4b5',
    } }, false).setOrigin(.5);
    this.add([this.ring, this.key]);
    scene.add.existing(this);
    this.setName('hold-interaction-indicator').setDepth(200000).setVisible(false);
  }

  updatePosition(x: number, headY: number, visible: boolean, progress: number) {
    this.setPosition(x + 42, headY + 10).setVisible(visible);
    this.ring.clear();
    if (!visible) return;
    this.ring.fillStyle(0x142319, .9).fillCircle(0, 0, 17);
    this.ring.lineStyle(4, 0x64775b, 1).strokeCircle(0, 0, 14);
    if (progress > 0) {
      // Start at twelve o'clock and advance counterclockwise in screen space.
      this.ring.lineStyle(4, 0xf0e4b5, 1).beginPath();
      const end = Math.min(1, Math.max(0, progress)) * Math.PI * 2;
      for (let step = 0; step <= 64; step++) {
        const angle = -Math.PI / 2 - end * step / 64;
        const px = 14 * Math.cos(angle), py = 14 * Math.sin(angle);
        if (!step) this.ring.moveTo(px, py); else this.ring.lineTo(px, py);
      }
      this.ring.strokePath();
    }
  }
}
