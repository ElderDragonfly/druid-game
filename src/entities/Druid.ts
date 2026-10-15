import Phaser from 'phaser';
import { CHARACTERS, type CharacterDefinition } from '../data/characters';
import { DruidMovement, type DruidState } from '../behavior/DruidMovement';
import type { Facing } from '../input/FourWayFacing';

export class Druid extends Phaser.Physics.Arcade.Sprite {
  readonly actorState: DruidState;
  readonly behavior: DruidMovement;
  readonly appearance;

  constructor(scene: Phaser.Scene, readonly definition: CharacterDefinition) {
    const appearance = definition.game ?? CHARACTERS[0].game!;
    super(scene, 0, 0, appearance.texture, appearance.frames?.down);
    this.appearance = appearance;
    const stats = definition.stats ?? CHARACTERS[0].stats!;
    this.actorState = { health: stats.health, maxHealth: stats.health, speed: stats.speed, facing: 'down' };
    this.behavior = new DruidMovement(this.actorState);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const art = appearance.metrics;
    const originY = art.feetY - (art.bodyCenterY + art.bodyHeight / 2) / art.scale;
    this.setOrigin(.5, originY / art.height).setScale(art.scale)
      .setSize(art.bodyWidth / art.scale, art.bodyHeight / art.scale)
      .setOffset((art.width - art.bodyWidth / art.scale) / 2,
        originY + (art.bodyCenterY - art.bodyHeight / 2) / art.scale).setCollideWorldBounds(true);
  }

  move(x: number, y: number, facing: Facing) {
    const velocity = this.behavior.velocity(x, y, facing);
    this.setVelocity(velocity.x, velocity.y);
    this.updateAppearance();
  }

  updateAppearance(stopped = false) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const speed = stopped ? 0 : this.behavior.travelSpeed(body.velocity, body.blocked);
    const animation = speed > .01 ? this.appearance.walkAnimations?.[this.actorState.facing] : undefined;
    if (animation) {
      this.play(animation, true);
      this.anims.timeScale = speed / (this.definition.stats ?? CHARACTERS[0].stats!).walkReferenceSpeed;
    } else {
      this.anims.stop();
      this.anims.timeScale = 1;
      const frame = this.appearance.frames?.[this.actorState.facing];
      if (this.texture.key !== this.appearance.texture) this.setTexture(this.appearance.texture, frame);
      else if (frame && this.frame.name !== frame) this.setFrame(frame, false, false);
    }
  }
}
