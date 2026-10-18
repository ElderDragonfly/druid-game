import Phaser from 'phaser';
import { Wolf } from '../entities/Wolf';
import type { Druid } from '../entities/Druid';
import { WolfNavigation } from './WolfNavigation';
import { wolfSpawn } from './wolfSpawn';
import { environmentVariant } from '../data/environment';
import { MEADOW_PALETTE, PixelArt } from '../rendering/pixelArt';
import { drawForestFloor } from '../rendering/forestFloor';
import { FOREST_FLOOR } from './forestFloor';
import { obstacleRect, type MeadowLayout } from './meadowLayout';
import { GrassForeground } from '../rendering/GrassForeground';
import { Mouse } from '../entities/Mouse';
import { generateMousePopulation } from './mousePopulation';

export class MeadowWorld {
  readonly obstacles: Phaser.Physics.Arcade.StaticGroup;
  readonly mice: readonly Mouse[];
  wolf!: Wolf;
  private floor: Phaser.GameObjects.RenderTexture;
  private collider?: Phaser.Physics.Arcade.Collider;
  private grass: GrassForeground;
  private player?: Druid;
  private navigation?: WolfNavigation;
  private wolfGeneration = 0;

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
      const bounds = obstacleRect(object), topLeft = image.getTopLeft();
      // Physics and generation/pathfinding share the same trimmed trunk.
      body.setSize(bounds.width, bounds.height, false)
        .setOffset(bounds.x - topLeft.x, bounds.y - topLeft.y);
    });
    this.mice = generateMousePopulation(layout).map((start, index) =>
      new Mouse(scene, layout, this.obstacles, start, index + 1));
  }

  bindPlayer(player: Druid) {
    this.player = player;
    this.collider = this.scene.physics.add.collider(player, this.obstacles);
    this.navigation = new WolfNavigation(this.layout);
    this.spawnWolf();
  }

  private spawnWolf() {
    const player = this.player!, navigation = this.navigation!;
    const body = player.body as Phaser.Physics.Arcade.Body;
    // Before the initial reset, layout.spawn supplies the starting position.
    const center = this.wolfGeneration ? { x: body.center.x, y: body.bottom } : undefined;
    this.wolf = new Wolf(this.scene, navigation, this.obstacles, player,
      wolfSpawn(navigation, this.wolfGeneration, center));
  }

  updateGrass(footX: number, footY: number, depth: number) {
    this.grass.update(footX, footY, depth);
  }

  update(delta: number) {
    this.mice.forEach(mouse => mouse.updateBehavior(delta));
    this.wolf?.updateBehavior(delta);
    if (this.wolf?.deathFinished) {
      this.wolf.destroy(); this.wolfGeneration++; this.spawnWolf();
    }
  }

  destroy() {
    this.wolf?.destroy();
    this.mice.forEach(mouse => mouse.destroy());
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
