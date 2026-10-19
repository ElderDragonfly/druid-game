import Phaser from 'phaser';
import { WOLF } from '../data/wolf';
import { WolfBehavior } from '../behavior/WolfBehavior';
import { WolfNavigation, type WolfPoint } from '../world/WolfNavigation';
import { wolfDurations, type WolfAnimation } from '../rendering/wolfArt';
import type { Druid } from './Druid';
import { createDruidWolfCollider } from '../physics/wolfContact';
import type { Damageable } from '../combat/Damageable';
import type { WolfSave } from '../persistence/snapshots';

const HIT_DURATION = WOLF.combat.hitFrameDurations.reduce((sum, ms) => sum + ms, 0);
const HIT_POSES: readonly [WolfAnimation, number][] = [['idle', 0], ['death', 0], ['death', 1], ['death', 0], ['idle', 0]];
const DEATH_DURATION = wolfDurations('death').reduce((sum, ms) => sum + ms, 0);

export class Wolf extends Phaser.Physics.Arcade.Sprite implements Damageable {
  readonly definition = WOLF;
  readonly behavior: WolfBehavior;
  get actorState() { return this.behavior.actorState; }
  readonly shadow: Phaser.GameObjects.Image;
  private treeCollider?: Phaser.Physics.Arcade.Collider;
  private playerCollider?: Phaser.Physics.Arcade.Collider;
  private previous: WolfPoint;
  private animation: WolfAnimation = 'idle';
  private clock = 0;
  private attackConnected = false;
  private hitElapsed?: number;
  private deathElapsed = 0;
  get dying() { return this.actorState.health <= 0; }
  get reactingToHit() { return this.hitElapsed !== undefined; }
  get deathFinished() { return this.dying && this.deathElapsed >= DEATH_DURATION; }

  constructor(scene: Phaser.Scene, navigation: WolfNavigation, trees: Phaser.Physics.Arcade.StaticGroup,
    private readonly player: Druid, start: WolfPoint, identity = 0) {
    super(scene, start.x, start.y, 'wolf-idle', '0');
    scene.add.existing(this); scene.physics.add.existing(this);
    const a = WOLF.appearance, b = WOLF.body;
    this.setName('wolf').setOrigin(a.feetX / a.frameWidth, a.feetY / a.frameHeight).setScale(a.scale)
      .setSize(b.width / a.scale, b.height / a.scale)
      .setOffset(a.feetX - b.width / a.scale / 2, a.feetY - b.height / a.scale)
      .setCollideWorldBounds(true).setPushable(false);
    this.behavior = new WolfBehavior(navigation, start, identity); this.previous = { ...start };
    this.shadow = scene.add.image(start.x, start.y, 'wolf-idle-shadow', '0').setName('wolf-shadow')
      .setOrigin(this.originX, this.originY).setScale(a.scale);
    this.treeCollider = scene.physics.add.collider(this, trees);
    this.playerCollider = createDruidWolfCollider(scene, player, this);
    scene.cameras.getCamera('hud')?.ignore([this, this.shadow]);
  }

  takeDamage(amount: number) {
    if (this.dying || !this.scene || !Number.isFinite(amount) || amount <= 0) return false;
    this.actorState.health = Math.max(0, this.actorState.health - amount);
    this.behavior.alert();
    this.setVelocity(0, 0);
    this.previous = { x: this.x, y: this.y };
    if (this.dying) {
      this.hitElapsed = undefined; this.deathElapsed = 0;
      (this.body as Phaser.Physics.Arcade.Body).enable = false;
      this.treeCollider?.destroy(); this.playerCollider?.destroy();
      this.treeCollider = undefined; this.playerCollider = undefined;
      this.showFrame('death', 0);
    } else {
      // Pause the existing AI/attack clock, rather than restart its active frame.
      this.hitElapsed = 0; this.showFrame(...HIT_POSES[0]);
    }
    return true;
  }

  updateBehavior(delta: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!this.active) return;
    let dt = Math.max(0, delta);
    if (this.dying) {
      this.deathElapsed += dt;
      this.showFrame('death', this.frameAt(this.deathElapsed, wolfDurations('death')));
      return;
    }
    if (!body.enable) return;
    if (this.hitElapsed !== undefined) {
      const remaining = HIT_DURATION - this.hitElapsed;
      this.hitElapsed += dt;
      this.previous = { x: this.x, y: this.y };
      if (this.hitElapsed < HIT_DURATION) {
        this.setVelocity(0, 0);
        this.showFrame(...HIT_POSES[this.frameAt(this.hitElapsed, WOLF.combat.hitFrameDurations)]);
        return;
      }
      this.hitElapsed = undefined;
      dt = Math.max(0, dt - remaining);
    }
    const p = this.player.body as Phaser.Physics.Arcade.Body;
    const contact = this.player.wolfContactBounds;
    const position = { x: this.x, y: this.y };
    const distance = Math.hypot(this.x - this.previous.x, this.y - this.previous.y);
    this.previous = position;
    const velocity = this.behavior.step(dt, position, { x: p.center.x, y: p.bottom },
      contact);
    this.setVelocity(velocity.x, velocity.y).setFlipX(this.actorState.facingLeft).setDepth(this.y);
    const phase = this.actorState.phase;
    if (phase !== 'attack') this.attackConnected = false;
    else if (!this.attackConnected && this.actorState.elapsed >= WOLF.behavior.impactMs) {
      this.attackConnected = true;
      // Once per swing, at its active frame, and only if the druid is still in reach.
      if (this.behavior.inAttackRange(position, this.player.wolfContactBounds)) this.player.takeDamage(WOLF.combat.damage);
    }
    const moving = distance > .01 && distance < Math.max(30, this.actorState.runSpeed * dt / 1000 * 3);
    const animation: WolfAnimation = phase === 'attack' ? (this.actorState.attackUp ? 'attack-up' : 'attack-down') :
      moving ? (phase === 'chase' ? 'run' : 'walk') : 'idle';
    if (animation !== this.animation) { this.animation = animation; this.clock = 0; }
    if (phase === 'attack') this.clock = this.actorState.elapsed;
    else if (animation === 'run' || animation === 'walk') {
      const reference = animation === 'run' ? WOLF.appearance.runReferenceSpeed : WOLF.appearance.walkReferenceSpeed;
      this.clock += distance / reference * 1000;
    } else this.clock += dt;
    const durations = wolfDurations(animation), total = durations.reduce((sum, value) => sum + value, 0);
    let elapsed = phase === 'attack' ? Math.min(this.clock, total - .001) : this.clock % total;
    let frame = 0;
    while (frame < durations.length - 1 && elapsed >= durations[frame]) elapsed -= durations[frame++];
    this.showFrame(animation, frame);
  }

  private frameAt(elapsed: number, durations: readonly number[]) {
    let frame = 0;
    while (frame < durations.length - 1 && elapsed >= durations[frame]) elapsed -= durations[frame++];
    return frame;
  }

  snapshot(corpse = false): WolfSave {
    return { x: this.x, y: this.y, state: { ...this.actorState, target: { ...this.actorState.target } },
      timers: this.behavior.snapshotTimers(), animation: this.animation, clock: this.clock,
      hitElapsed: this.hitElapsed ?? null, deathElapsed: this.deathElapsed,
      attackConnected: this.attackConnected, corpse };
  }

  restore(saved: WolfSave) {
    if (saved.state.health === 0) this.takeDamage(this.actorState.health);
    Object.assign(this.actorState, saved.state, { target: { ...saved.state.target } });
    this.behavior.restoreTimers(saved.timers);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.reset(saved.x, saved.y); body.updateFromGameObject();
    body.prev.copy(body.position); body.prevFrame.copy(body.position);
    this.previous = { x: saved.x, y: saved.y };
    this.animation = saved.animation; this.clock = saved.clock;
    this.hitElapsed = saved.hitElapsed ?? undefined; this.deathElapsed = saved.deathElapsed;
    this.attackConnected = saved.attackConnected; this.setFlipX(saved.state.facingLeft);
    if (this.dying) {
      (this.body as Phaser.Physics.Arcade.Body).enable = false;
      this.showFrame('death', this.frameAt(this.deathElapsed, wolfDurations('death')));
    } else if (this.hitElapsed !== undefined) this.showFrame(...HIT_POSES[this.frameAt(this.hitElapsed, WOLF.combat.hitFrameDurations)]);
    else {
      const animation = this.actorState.phase === 'attack' ? (this.actorState.attackUp ? 'attack-up' : 'attack-down') : this.animation;
      const durations = wolfDurations(animation), total = durations.reduce((sum, value) => sum + value, 0);
      this.showFrame(animation, this.frameAt(this.actorState.phase === 'attack' ? this.actorState.elapsed : this.clock % total, durations));
    }
    if (saved.corpse) {
      this.setActive(false).setName('wolf-corpse'); this.shadow.setName('wolf-corpse-shadow');
    }
  }

  private showFrame(animation: WolfAnimation, frame: number) {
    this.setTexture(`wolf-${animation}`, String(frame)).setDepth(this.y);
    this.shadow.setTexture(`wolf-${animation}-shadow`, String(frame)).setPosition(this.x, this.y)
      .setFlipX(this.flipX).setDepth(this.y - .1);
  }

  override destroy(fromScene?: boolean) {
    if (!this.scene) return;
    this.treeCollider?.destroy(); this.playerCollider?.destroy(); this.shadow?.destroy();
    super.destroy(fromScene);
  }
}
