import Phaser from 'phaser';

interface ButtonOptions {
  name: string;
  label: string;
  width?: number;
  height?: number;
  labelY?: number;
  fontSize?: number;
  enabled?: boolean;
  onClick?: () => void;
}

export class MenuButton extends Phaser.GameObjects.Container {
  readonly enabled: boolean;
  private frame: Phaser.GameObjects.Graphics;
  private selected = false;
  private hovered = false;
  private buttonWidth: number;
  private buttonHeight: number;

  constructor(scene: Phaser.Scene, x: number, y: number, options: ButtonOptions) {
    super(scene, x, y);
    this.enabled = options.enabled ?? true;
    this.buttonWidth = options.width ?? 252;
    this.buttonHeight = options.height ?? 58;
    this.setName(options.name).setSize(this.buttonWidth, this.buttonHeight);
    this.frame = scene.add.graphics();
    const label = scene.add.text(0, options.labelY ?? 0, options.label, {
      fontFamily: 'Georgia, serif', fontSize: `${options.fontSize ?? 25}px`,
      color: this.enabled ? '#e6d9b4' : '#68746a',
    }).setOrigin(0.5);
    this.add([this.frame, label]);
    scene.add.existing(this);
    if (this.enabled) {
      this.setInteractive({
        // Phaser прибавляет displayOrigin контейнера к локальной точке ввода.
        hitArea: new Phaser.Geom.Rectangle(0, 0, this.buttonWidth, this.buttonHeight),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true,
      });
      this.on('pointerover', () => { this.hovered = true; this.draw(); });
      this.on('pointerout', () => { this.hovered = false; this.draw(); });
      this.on('pointerup', () => options.onClick?.());
    }
    this.draw();
  }

  setSelected(selected: boolean) {
    this.selected = selected;
    this.draw();
    return this;
  }

  private draw() {
    const w = this.buttonWidth;
    const h = this.buttonHeight;
    const highlighted = this.enabled && (this.selected || this.hovered);
    this.frame.clear().fillStyle(0x060d09, 0.55).fillRoundedRect(-w / 2, -h / 2 + 4, w, h, 5);
    this.frame.fillStyle(highlighted ? 0x2d3e2c : 0x132219, this.enabled ? 0.94 : 0.88)
      .fillRoundedRect(-w / 2, -h / 2, w, h, 5);
    this.frame.lineStyle(1, highlighted ? 0xc6b27b : this.enabled ? 0x697958 : 0x354537)
      .strokeRoundedRect(-w / 2, -h / 2, w, h, 5);
    this.frame.lineStyle(1, 0x8e9b70, this.enabled ? 0.22 : 0.07)
      .strokeRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 3);
  }
}
