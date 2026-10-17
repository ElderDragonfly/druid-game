import Phaser from 'phaser';
import { WOLF } from '../data/wolf';
import { WolfBehavior } from '../behavior/WolfBehavior';
import { WolfNavigation, type WolfPoint } from '../world/WolfNavigation';
import { wolfDurations, type WolfAnimation } from '../rendering/wolfArt';
import type { Druid } from './Druid';

export class Wolf extends Phaser.Physics.Arcade.Sprite {
  readonly definition = WOLF;
  readonly behavior: WolfBehavior;
  get actorState() { return this.behavior.actorState; }
  readonly shadow: Phaser.GameObjects.Image;
  private treeCollider: Phaser.Physics.Arcade.Collider;
  private playerCollider: Phaser.Physics.Arcade.Collider;
  private previous: WolfPoint;
  private animation: WolfAnimation = 'idle';
  private clock = 0;

  constructor(scene: Phaser.Scene, navigation: WolfNavigation, trees: Phaser.Physics.Arcade.StaticGroup,
    private readonly player: Druid, start: WolfPoint) {
    super(scene, start.x, start.y, 'wolf-idle', '0');
    scene.add.existing(this); scene.physics.add.existing(this);
    const a = WOLF.appearance, b = WOLF.body;
    this.setName('wolf').setOrigin(a.feetX / a.frameWidth, a.feetY / a.frameHeight).setScale(a.scale)
      .setSize(b.width / a.scale, b.height / a.scale)
      .setOffset(a.feetX - b.width / a.scale / 2, a.feetY - b.height / a.scale)
      .setCollideWorldBounds(true).setPushable(false);
    this.behavior = new WolfBehavior(navigation, start); this.previous = { ...start };
    this.shadow = scene.add.image(start.x, start.y, 'wolf-idle-shadow', '0').setName('wolf-shadow')
      .setOrigin(this.originX, this.originY).setScale(a.scale);
    this.treeCollider = scene.physics.add.collider(this, trees);
    this.playerCollider = scene.physics.add.collider(player, this);
  }

  updateBehavior(delta: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!this.active || !body.enable) return;
    const p = this.player.body as Phaser.Physics.Arcade.Body;
    const position = { x: this.x, y: this.y };
    const distance = Math.hypot(this.x - this.previous.x, this.y - this.previous.y);
    this.previous = position;
    const velocity = this.behavior.step(delta, position, { x: p.center.x, y: p.bottom },
      { x: p.x, y: p.y, width: p.width, height: p.height });
    this.setVelocity(velocity.x, velocity.y).setFlipX(this.actorState.facingLeft).setDepth(this.y);
    const phase = this.actorState.phase;
    const moving = distance > .01 && distance < Math.max(30, this.actorState.runSpeed * delta / 1000 * 3);
    const animation: WolfAnimation = phase === 'attack' ? (this.actorState.attackUp ? 'attack-up' : 'attack-down') :
      moving ? (phase === 'chase' ? 'run' : 'walk') : 'idle';
    if (animation !== this.animation) { this.animation = animation; this.clock = 0; }
    if (phase === 'attack') this.clock = this.actorState.elapsed;
    else if (animation === 'run' || animation === 'walk') {
      const reference = animation === 'run' ? WOLF.appearance.runReferenceSpeed : WOLF.appearance.walkReferenceSpeed;
      this.clock += distance / reference * 1000;
    } else this.clock += Math.max(0, delta);
    const durations = wolfDurations(animation), total = durations.reduce((sum, value) => sum + value, 0);
    let elapsed = phase === 'attack' ? Math.min(this.clock, total - .001) : this.clock % total;
    let frame = 0;
    while (frame < durations.length - 1 && elapsed >= durations[frame]) elapsed -= durations[frame++];
    this.setTexture(`wolf-${animation}`, String(frame));
    this.shadow.setTexture(`wolf-${animation}-shadow`, String(frame)).setPosition(this.x, this.y)
      .setFlipX(this.flipX).setDepth(this.y - .1);
  }

  override destroy(fromScene?: boolean) {
    if (!this.scene) return;
    this.treeCollider?.destroy(); this.playerCollider?.destroy(); this.shadow?.destroy();
    super.destroy(fromScene);
  }
}
