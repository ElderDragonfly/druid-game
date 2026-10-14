import Phaser from 'phaser';
import { environmentVariant } from '../data/environment';
import { MEADOW_PALETTE, PixelArt } from '../rendering/pixelArt';
import { drawForestFloor } from '../rendering/forestFloor';
import { MEADOW_PIXEL_SCALE, type MeadowLayout } from './meadowLayout';

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
    const scale = MEADOW_PIXEL_SCALE;
    const floor = drawForestFloor(this.scene, this.layout);
    const g = this.scene.add.graphics();
    const p = new PixelArt(g);
    for (const object of this.layout.obstacles) {
      const size = environmentVariant(object.kind, object.variant);
      p.ellipse(MEADOW_PALETTE.forestShadow, Math.round(object.x / scale + 4), Math.round(object.y / scale - 2),
        size.bodyWidth / scale * 0.7, size.bodyHeight / scale * 0.45);
    }
    floor.draw(g);
    g.destroy();
    return floor;
  }
}
