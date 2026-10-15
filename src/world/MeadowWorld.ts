import Phaser from 'phaser';
import { environmentVariant } from '../data/environment';
import { MEADOW_PALETTE, PixelArt } from '../rendering/pixelArt';
import { drawForestFloor } from '../rendering/forestFloor';
import { FOREST_FLOOR } from './forestFloor';
import type { MeadowLayout } from './meadowLayout';
import { GrassForeground } from '../rendering/GrassForeground';
import { Mouse } from '../entities/Mouse';

export class MeadowWorld {
  readonly obstacles: Phaser.Physics.Arcade.StaticGroup;
  readonly mouse: Mouse;
  private floor: Phaser.GameObjects.RenderTexture;
  private collider?: Phaser.Physics.Arcade.Collider;
  private grass: GrassForeground;

  constructor(private scene: Phaser.Scene, readonly layout: MeadowLayout) {
    const surface = this.drawFloor();
    this.floor = surface.floor;
    this.grass = new GrassForeground(scene, surface.raster);
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
    this.mouse = new Mouse(scene, layout, this.obstacles);
  }

  bindPlayer(player: Phaser.Physics.Arcade.Image | Phaser.Physics.Arcade.Sprite) {
    this.collider = this.scene.physics.add.collider(player, this.obstacles);
  }

  updateGrass(footX: number, footY: number, depth: number) {
    this.grass.update(footX, footY, depth);
  }

  update(delta: number) { this.mouse.updateBehavior(delta); }

  destroy() {
    this.mouse.destroy();
    this.collider?.destroy();
    this.obstacles.clear(true, true);
    this.obstacles.destroy();
    this.floor.destroy();
    this.grass.destroy();
  }

  private drawFloor() {
    const scale = FOREST_FLOOR.pixelScale;
    const surface = drawForestFloor(this.scene, this.layout);
    const g = this.scene.add.graphics();
    const p = new PixelArt(g);
    for (const object of this.layout.obstacles) {
      const size = environmentVariant(object.kind, object.variant);
      p.ellipse(MEADOW_PALETTE.forestShadow, Math.round(object.x / scale + 4), Math.round(object.y / scale - 2),
        size.bodyWidth / scale * 0.7, size.bodyHeight / scale * 0.45);
    }
    surface.floor.draw(g);
    g.destroy();
    return surface;
  }
}
