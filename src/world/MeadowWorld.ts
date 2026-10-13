import Phaser from 'phaser';
import { createMeadowTextures } from '../rendering/meadowTextures';
import { MEADOW_PIXEL_SCALE, OBSTACLE_SIZES, seededRandom, type MeadowLayout } from './meadowLayout';

export class MeadowWorld {
  readonly obstacles: Phaser.Physics.Arcade.StaticGroup;
  private floor: Phaser.GameObjects.RenderTexture;
  private collider?: Phaser.Physics.Arcade.Collider;

  constructor(private scene: Phaser.Scene, readonly layout: MeadowLayout) {
    createMeadowTextures(scene);
    this.floor = this.drawFloor();
    this.obstacles = scene.physics.add.staticGroup();
    layout.obstacles.forEach((object, index) => {
      const texture = object.kind === 'stump' ? 'meadow-stump' : `meadow-${object.kind}-${object.variant}`;
      const image = this.obstacles.create(object.x, object.y, texture) as Phaser.Physics.Arcade.Image;
      image.setName(`obstacle-${index}`).setData('kind', object.kind).setOrigin(0.5, 1)
        .setScale(MEADOW_PIXEL_SCALE).setDepth(object.y);
      image.refreshBody();
      const body = image.body as Phaser.Physics.Arcade.StaticBody;
      const size = OBSTACLE_SIZES[object.kind];
      const width = size.bodyWidth * MEADOW_PIXEL_SCALE;
      const height = size.bodyHeight * MEADOW_PIXEL_SCALE;
      body.setSize(width, height, false).setOffset((image.displayWidth - width) / 2, image.displayHeight - height);
    });
  }

  bindPlayer(player: Phaser.Physics.Arcade.Image) {
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
    g.fillStyle(0x45603a).fillRect(0, 0, w, h);
    for (let i = 0; i < 320; i++) {
      const x = Math.floor(random() * w);
      const y = Math.floor(random() * h);
      const edge = Math.min(x, w - x, y, h - y);
      g.fillStyle(edge < 45 ? 0x354e33 : i % 2 ? 0x4c663d : 0x415b36, 0.65)
        .fillRect(x, y, 8 + Math.floor(random() * 16), 3 + Math.floor(random() * 8));
    }
    for (let i = 0; i < 950; i++) {
      const x = Math.floor(random() * w);
      const y = Math.floor(random() * h);
      g.fillStyle(i % 3 ? 0x69814a : 0x2d492e, 0.65).fillRect(x, y, 1, 2).fillRect(x + 2, y + 1, 1, 1);
      if (i % 59 === 0) g.fillStyle(0xb4a76a).fillRect(x, y, 1, 1);
    }
    const floor = this.scene.add.renderTexture(width / 2, height / 2, w, h).draw(g).setDisplaySize(width, height).setDepth(-1000);
    floor.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    g.destroy();
    return floor;
  }
}
