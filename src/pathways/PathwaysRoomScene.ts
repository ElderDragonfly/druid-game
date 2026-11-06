import Phaser from 'phaser';
import { Druid } from '../entities/Druid';
import { CHARACTERS, type CharacterDefinition } from '../data/characters';
import { environmentVariant } from '../data/environment';
import { facingFromVector, type MovementKeys } from '../input/EightWayFacing';
import { forestFloorSamples } from '../rendering/forestFloor';
import { FOREST_FLOOR, generateForestFloor } from '../world/forestFloor';
import { GrassForeground } from '../rendering/GrassForeground';
import { PATH_ROOM, generatePathRoom, type PathRoomLayout } from './roomLayout';

/** Isolated route prototype: walking, a forest boundary and a one-way transition. */
export class PathwaysRoomScene extends Phaser.Scene {
  player!: Druid;
  layout!: PathRoomLayout;
  transitioning = false;
  private roomIndex: 0 | 1 = 0;
  private seed = 0;
  private movement!: MovementKeys;
  private shadow!: Phaser.GameObjects.Image;
  private floor!: Phaser.GameObjects.TileSprite;
  private grass!: GrassForeground;
  private feetOffset = 0;

  constructor() { super('PathwaysRoom'); }

  init(data: { index?: 0 | 1; seed?: number } = {}) {
    this.roomIndex = data.index ?? 0;
    this.seed = data.seed ?? Math.floor(Math.random() * 0x100000000);
    this.transitioning = false;
  }

  create() {
    this.layout = generatePathRoom(this.seed, this.roomIndex);
    this.physics.world.setBounds(0, 0, PATH_ROOM.width, PATH_ROOM.height);
    this.buildFloor();
    for (const [i, tree] of this.layout.trees.entries()) {
      const art = environmentVariant(tree.kind, tree.variant);
      this.add.image(tree.x, tree.y, art.texture, art.frame)
        .setOrigin(art.anchorX / art.width, art.anchorY / art.height).setScale(art.scale)
        .setDepth(tree.y).setName(`path-tree-${i}`);
    }
    const boundaries = this.physics.add.staticGroup();
    for (const [i, wall] of this.layout.walls.entries()) {
      const image = boundaries.create(wall.x, wall.y, '__WHITE') as Phaser.Physics.Arcade.Image;
      image.setOrigin(0).setDisplaySize(wall.width, wall.height).setVisible(false)
        .setName(`forest-boundary-${i}`).refreshBody();
    }
    const base = CHARACTERS[0];
    const character: CharacterDefinition = { ...base, game: { ...base.game!, casts: undefined, hits: undefined } };
    this.player = new Druid(this, character);
    this.player.setName('path-druid');
    const art = this.player.appearance.metrics;
    this.feetOffset = art.bodyCenterY + art.bodyHeight / 2;
    (this.player.body as Phaser.Physics.Arcade.Body).reset(this.layout.spawn.x, this.layout.spawn.y);
    this.physics.add.collider(this.player, boundaries);
    this.shadow = this.add.image(0, 0, 'meadow-druid-shadow').setScale(2.5).setAlpha(.6);
    this.movement = this.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as MovementKeys;

    const afterPhysics = () => {
      this.updateVisuals();
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      if (this.roomIndex === 0 && !this.transitioning && body.center.y < PATH_ROOM.gate.triggerY) this.nextRoom();
    };
    const resetInput = () => {
      this.input.keyboard?.resetKeys();
      this.player.setVelocity(0, 0); this.player.updateAppearance(true);
    };
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, afterPhysics);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeCamera, this);
    this.game.events.on(Phaser.Core.Events.BLUR, resetInput);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, afterPhysics);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeCamera, this);
      this.game.events.off(Phaser.Core.Events.BLUR, resetInput);
      this.textures.remove('pathways-floor');
    });
    this.resizeCamera(); this.updateVisuals();
    this.cameras.main.fadeIn(300, 15, 28, 20);
  }

  update() {
    const keys = this.movement;
    const x = Number(keys.right.isDown) - Number(keys.left.isDown);
    const y = Number(keys.down.isDown) - Number(keys.up.isDown);
    this.player.move(this.transitioning ? 0 : x, this.transitioning ? 0 : y,
      facingFromVector(x, y) ?? this.player.actorState.facing);
  }

  private buildFloor() {
    const scale = FOREST_FLOOR.pixelScale;
    const raster = generateForestFloor(forestFloorSamples(this), Math.ceil(PATH_ROOM.width / scale),
      Math.ceil(PATH_ROOM.height / scale), this.layout.seed ^ this.roomIndex);
    const texture = this.textures.createCanvas('pathways-floor', raster.width, raster.height)!;
    const image = texture.context.createImageData(raster.width, raster.height);
    image.data.set(raster.pixels); texture.context.putImageData(image, 0, 0);
    texture.refresh().setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.floor = this.add.tileSprite(0, 0, PATH_ROOM.width, PATH_ROOM.height, texture)
      .setOrigin(0).setTileScale(scale).setDepth(-1000).setName('pathways-floor');
    this.grass = new GrassForeground(this, raster);
  }

  private updateVisuals() {
    const footY = this.player.y + this.feetOffset;
    this.player.setDepth(footY); this.player.syncCastVisual();
    this.shadow.setPosition(this.player.x, footY).setDepth(footY - .1);
    this.grass.update(this.player.x, footY, footY);
  }

  private resizeCamera() {
    const camera = this.cameras.main, { width, height } = this.scale;
    // Keep the entire clearing visible at every aspect ratio, with grass filling the window.
    const zoom = Math.min(width / PATH_ROOM.width, height / PATH_ROOM.height);
    camera.setSize(width, height).setZoom(zoom).centerOn(PATH_ROOM.width / 2, PATH_ROOM.height / 2);
    const w = width / zoom, h = height / zoom;
    const x = (PATH_ROOM.width - w) / 2, y = (PATH_ROOM.height - h) / 2;
    this.floor.setPosition(x, y).setSize(w, h).setTilePosition(x / FOREST_FLOOR.pixelScale, y / FOREST_FLOOR.pixelScale);
  }

  private nextRoom() {
    this.transitioning = true;
    this.player.setVelocity(0, 0); this.player.updateAppearance(true);
    this.cameras.main.fadeOut(250, 15, 28, 20);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
      () => this.scene.restart({ index: 1, seed: this.seed }));
  }
}
