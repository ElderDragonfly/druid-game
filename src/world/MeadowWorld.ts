import Phaser from 'phaser';
import { environmentVariant } from '../data/environment';
import { MEADOW_PALETTE, PixelArt } from '../rendering/pixelArt';
import { MEADOW_PIXEL_SCALE, seededRandom, type MeadowLayout } from './meadowLayout';

export class MeadowWorld {
  readonly obstacles: Phaser.Physics.Arcade.StaticGroup;
  private floor: Phaser.GameObjects.RenderTexture;
  private collider?: Phaser.Physics.Arcade.Collider;

  constructor(private scene: Phaser.Scene, readonly layout: MeadowLayout) {
    this.floor = this.drawFloor();
    this.obstacles = scene.physics.add.staticGroup();
    layout.obstacles.forEach((object, index) => {
      const art = environmentVariant(object.kind, object.variant);
      const image = this.obstacles.create(object.x, object.y, art.texture, art.frame) as Phaser.Physics.Arcade.Image;
      image.setName(`obstacle-${index}`).setData('kind', object.kind).setOrigin(art.anchorX / art.width, art.anchorY / art.height)
        .setScale(art.scale).setDepth(object.y);
      image.refreshBody();
      const body = image.body as Phaser.Physics.Arcade.StaticBody;
      body.setSize(art.bodyWidth, art.bodyHeight, false)
        .setOffset(art.anchorX * art.scale - art.bodyWidth / 2, art.anchorY * art.scale - art.bodyHeight);
    });
  }

  bindPlayer(player: Phaser.Physics.Arcade.Image | Phaser.Physics.Arcade.Sprite) {
    this.collider = this.scene.physics.add.collider(player, this.obstacles);
  }

  destroy() {
    this.collider?.destroy();
    this.obstacles.clear(true, true);
    this.obstacles.destroy();
    this.floor.destroy();
  }

  private drawFloor() {
    const { width, height, seed } = this.layout;
    const scale = MEADOW_PIXEL_SCALE;
    const w = Math.ceil(width / scale);
    const h = Math.ceil(height / scale);
    const random = seededRandom(seed ^ 0x51f15e);
    const g = this.scene.add.graphics();
    const p = new PixelArt(g);
    p.rect(MEADOW_PALETTE.ground, 0, 0, w, h);
    const area = w * h / (384 * 216);
    for (let i = 0; i < Math.round(280 * area); i++) {
      const x = Math.floor(random() * w);
      const y = Math.floor(random() * h);
      const edge = Math.min(x, w - x, y, h - y);
      const color = edge < 30 ? MEADOW_PALETTE.forestShadow : MEADOW_PALETTE.groundShades[i % 4];
      const rx = 6 + Math.floor(random() * 16);
      const ry = 4 + Math.floor(random() * 9);
      p.ellipse(color, x, y, rx, ry);
      p.ellipse(color, x + rx * 0.6, y + ry * 0.6, rx * 0.6, ry * 0.6);
    }
    // Короткие травинки и листья видны сверху; их плотность идёт пятнами.
    for (let i = 0; i < Math.round(3800 * area); i++) {
      const x = Math.floor(random() * w);
      const y = Math.floor(random() * h);
      const patch = Math.sin(x / 16) + Math.cos(y / 11) + Math.sin((x + y) / 27);
      if (patch < -0.6 && random() < 0.8) continue;
      const color = MEADOW_PALETTE.grass[Math.floor(random() * 4)];
      p.rect(color, x, y, 2, 1);
      if (i % 3 === 0) p.rect(color, x + 1, y - 1);
      if (i % 5 === 0) p.rect(color, x - 2, y + 2, 2, 1);
      if (i % 109 === 0 && patch > 0) {
        p.rect(0x526842, x, y - 2, 1, 3);
        p.rect(MEADOW_PALETTE.flower[i % 3], x - 1, y - 3, 2, 2);
      }
    }
    for (const object of this.layout.obstacles) {
      const size = environmentVariant(object.kind, object.variant);
      p.ellipse(MEADOW_PALETTE.forestShadow, Math.round(object.x / scale + 4), Math.round(object.y / scale - 2),
        size.bodyWidth / scale * 0.7, size.bodyHeight / scale * 0.45);
    }
    const floor = this.scene.add.renderTexture(width / 2, height / 2, w, h).draw(g).setDisplaySize(width, height).setDepth(-1000);
    floor.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    g.destroy();
    return floor;
  }
}
