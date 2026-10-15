import Phaser from 'phaser';
import { MOUSE } from '../data/mouse';
import { MouseWander, type MousePoint } from '../behavior/MouseWander';
import type { MeadowLayout } from '../world/meadowLayout';

export class Mouse extends Phaser.Physics.Arcade.Sprite {
  readonly definition = MOUSE;
  readonly behavior: MouseWander;
  get actorState() { return this.behavior.actorState; }
  private shadow: Phaser.GameObjects.Ellipse;
  private treeCollider: Phaser.Physics.Arcade.Collider;

  constructor(scene: Phaser.Scene, layout: MeadowLayout, trees: Phaser.Physics.Arcade.StaticGroup, start: MousePoint, instanceSeed: number) {
    super(scene, start.x, start.y, 'mouse-run', 'mouse-run-0');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setName('wandering-mouse').setOrigin(MOUSE.feetX / MOUSE.frameWidth, MOUSE.feetY / MOUSE.frameHeight)
      .setScale(MOUSE.scale).setSize(MOUSE.bodyWidth / MOUSE.scale, MOUSE.bodyHeight / MOUSE.scale)
      .setOffset(MOUSE.feetX - MOUSE.bodyWidth / MOUSE.scale / 2, MOUSE.feetY - MOUSE.bodyHeight / MOUSE.scale)
      .setCollideWorldBounds(true).setDepth(this.y);
    this.shadow = scene.add.ellipse(this.x, this.y - 1, 16, 16 / 3, 0x0c1611, .35).setDepth(this.y - .1);
    this.treeCollider = scene.physics.add.collider(this, trees);
    this.behavior = new MouseWander(layout, start, instanceSeed);
    this.play('mouse-run');
  }

  updateBehavior(delta: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const blocked = body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down;
    const velocity = this.behavior.step(delta, { x: this.x, y: this.y }, blocked);
    this.setVelocity(velocity.x, velocity.y).setDepth(this.y);
    if (Math.abs(velocity.x) > 1) this.setFlipX(velocity.x > 0);
    this.play(`mouse-${this.behavior.state}`, true);
    this.shadow.setPosition(this.x, this.y - 1).setDepth(this.y - .1);
  }

  override destroy(fromScene?: boolean) {
    if (!this.scene) return;
    this.treeCollider?.destroy();
    this.shadow?.destroy();
    super.destroy(fromScene);
  }
}
