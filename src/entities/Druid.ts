import Phaser from 'phaser';
import { CHARACTERS, type CharacterDefinition } from '../data/characters';
import { DruidMovement, type DruidState } from '../behavior/DruidMovement';
import type { Facing } from '../input/EightWayFacing';
import { DruidCasting } from '../behavior/DruidCasting';
import { DruidHitReaction } from '../behavior/DruidHitReaction';
import { HIT_METRICS } from '../rendering/druidHitArt';
import { CAST_METRICS } from '../rendering/druidCastArt';
import { wolfContactBounds } from '../physics/wolfContact';
import { ACORN } from '../data/acorn';
import type { Damageable } from '../combat/Damageable';
import { COMBAT_EVENTS } from '../combat/events';
import type { DruidSave } from '../persistence/snapshots';

export class Druid extends Phaser.Physics.Arcade.Sprite implements Damageable {
  readonly actorState: DruidState;
  readonly behavior: DruidMovement;
  readonly appearance;
  readonly casting = new DruidCasting(ACORN.releaseMs, () => this.actorState.attackRate);
  readonly hitReaction = new DruidHitReaction();
  readonly hitVisual: Phaser.GameObjects.Image;
  readonly castVisual: Phaser.GameObjects.Image;
  private activeWalk?: Facing;
  private nextWalkFrame: Partial<Record<Facing, number>> = {};
  private interactionLocked = false;
  get dead() { return this.actorState.health <= 0; }
  /** Shared gate for player actions, including future abilities/use actions. */
  get canStartAction() { return !this.dead && !this.interactionLocked && !this.hitReaction.active; }

  setInteractionLocked(locked: boolean) {
    if (this.interactionLocked === locked) return;
    this.interactionLocked = locked;
    if (locked) {
      this.cancelCast(); this.setVelocity(0, 0); this.updateAppearance(true);
    }
  }

  get wolfContactBounds() {
    return wolfContactBounds(this.body as Phaser.Physics.Arcade.Body, this.appearance.wolfContactPadding);
  }

  constructor(scene: Phaser.Scene, readonly definition: CharacterDefinition) {
    const appearance = definition.game ?? CHARACTERS[0].game!;
    super(scene, 0, 0, appearance.texture, appearance.frames?.down);
    this.appearance = appearance;
    const stats = definition.stats ?? CHARACTERS[0].stats!;
    this.actorState = { health: stats.health, maxHealth: stats.health, speed: stats.speed,
      attackRate: stats.attackRate, range: stats.range, facing: 'down' };
    this.behavior = new DruidMovement(this.actorState);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const art = appearance.metrics;
    const originY = art.feetY - (art.bodyCenterY + art.bodyHeight / 2) / art.scale;
    this.setOrigin(.5, originY / art.height).setScale(art.scale)
      .setSize(art.bodyWidth / art.scale, art.bodyHeight / art.scale)
      .setOffset((art.width - art.bodyWidth / art.scale) / 2,
        originY + (art.bodyCenterY - art.bodyHeight / 2) / art.scale).setCollideWorldBounds(true);
    const initialCast = appearance.casts?.down;
    this.castVisual = scene.add.image(0, 0, initialCast?.texture ?? appearance.texture, initialCast?.frames[0])
      .setOrigin(.5, (originY + CAST_METRICS.offsetY) / CAST_METRICS.height)
      .setScale(art.scale).setVisible(false).setName('druid-casting');
    const initialHit = appearance.hits?.left;
    this.hitVisual = scene.add.image(0, 0, initialHit?.texture ?? appearance.texture, initialHit?.frames[0])
      .setOrigin(.5, (originY + HIT_METRICS.offsetY) / HIT_METRICS.height)
      .setScale(art.scale).setVisible(false).setName('druid-hit-reaction');
    this.once(Phaser.GameObjects.Events.DESTROY, () => { this.castVisual.destroy(); this.hitVisual.destroy(); });
  }

  move(x: number, y: number, facing: Facing) {
    if (this.dead || this.interactionLocked) { this.setVelocity(0, 0); return; }
    if (this.hitReaction.active) {
      this.setVelocity(0, 0); this.actorState.facing = this.hitReaction.facing; return;
    }
    const casting = this.casting.active;
    // Casting takes priority over held movement keys, including between
    // repeated casts. The unchanged speed stat is used again when it ends.
    const velocity = this.behavior.velocity(casting ? 0 : x, casting ? 0 : y,
      casting ? this.casting.facing : facing);
    this.setVelocity(velocity.x, velocity.y);
    this.updateAppearance();
  }

  updateAppearance(stopped = false) {
    if (this.casting.active || this.hitReaction.active) return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const speed = stopped ? 0 : this.behavior.travelSpeed(body.velocity, body.blocked);
    const animation = speed > .01 ? this.appearance.walkAnimations?.[this.actorState.facing] : undefined;
    if (animation) {
      if (!this.anims.isPlaying || this.anims.currentAnim?.key !== animation) {
        this.rememberStep();
        const direction = this.actorState.facing;
        // Begin visibly stepping immediately. Successive short taps continue
        // with the next pose instead of resetting to the same first frame.
        this.play({ key: animation, startFrame: this.nextWalkFrame[direction] ?? 0 });
        this.activeWalk = direction;
      }
      this.anims.timeScale = speed / (this.definition.stats ?? CHARACTERS[0].stats!).walkReferenceSpeed;
    } else {
      this.rememberStep();
      this.anims.stop();
      this.anims.timeScale = 1;
      const frame = this.appearance.frames?.[this.actorState.facing];
      if (this.texture.key !== this.appearance.texture) this.setTexture(this.appearance.texture, frame);
      else if (frame && this.frame.name !== frame) this.setFrame(frame, false, false);
    }
  }

  receiveHit() {
    if (this.dead || this.hitReaction.active) return false;
    const facing = this.actorState.facing;
    this.cancelCast(); this.rememberStep(); this.anims.stop();
    this.updateAppearance(true);
    this.hitReaction.start(facing); this.setVelocity(0, 0);
    this.showHit(); this.syncCastVisual();
    return true;
  }

  takeDamage(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0 || !this.receiveHit()) return false;
    this.actorState.health = Math.max(0, this.actorState.health - amount);
    this.emit(COMBAT_EVENTS.healthChanged);
    if (this.dead) this.emit(COMBAT_EVENTS.died);
    return true;
  }

  cancelHit() {
    this.hitReaction.cancel(); this.hitVisual.setVisible(false); this.setVisible(!this.casting.active);
  }

  private showHit() {
    const art = this.appearance.hits?.[this.hitReaction.facing];
    this.castVisual.setVisible(false);
    this.setVisible(!art); this.hitVisual.setVisible(!!art);
    if (art) this.hitVisual.setTexture(art.texture, art.frames[this.hitReaction.frameIndex]);
  }

  updateCasting(delta: number, requested?: Facing) {
    if (this.dead) return;
    this.hitReaction.update(delta);
    if (this.hitReaction.active) { this.showHit(); return; }
    this.hitVisual.setVisible(false);
    if (this.interactionLocked) { this.cancelCast(); this.updateAppearance(true); return; }
    this.casting.update(delta, requested && this.appearance.casts?.[requested] ? requested : undefined);
    if (this.casting.active) {
      this.rememberStep();
      this.anims.stop();
      this.actorState.facing = this.casting.facing;
      const art = this.appearance.casts![this.casting.facing]!;
      this.castVisual.setTexture(art.texture, art.frames[this.casting.frameIndex]);
    }
    this.setVisible(!this.casting.active);
    this.castVisual.setVisible(this.casting.active);
  }

  syncCastVisual() {
    this.castVisual.setPosition(this.x, this.y).setDepth(this.depth);
    this.hitVisual.setPosition(this.x, this.y).setDepth(this.depth);
  }

  cancelCast() {
    this.casting.cancel();
    this.castVisual.setVisible(false);
    this.setVisible(!this.hitReaction.active || !this.appearance.hits?.[this.hitReaction.facing]);
  }

  snapshot(): DruidSave {
    return { x: this.x, y: this.y, state: { ...this.actorState },
      cast: this.casting.snapshot(), hit: this.hitReaction.snapshot() };
  }

  restore(saved: DruidSave) {
    Object.assign(this.actorState, saved.state);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.reset(saved.x, saved.y); body.updateFromGameObject();
    body.prev.copy(body.position); body.prevFrame.copy(body.position);
    this.casting.restore(saved.cast); this.hitReaction.restore(saved.hit);
    this.updateAppearance(true); this.updateCasting(0); this.syncCastVisual();
  }

  private rememberStep() {
    if (!this.activeWalk) return;
    const count = this.anims.currentAnim?.frames.length ?? 4;
    // Phaser's AnimationFrame.index is one-based; this is the next zero-based pose.
    this.nextWalkFrame[this.activeWalk] = (this.anims.currentFrame?.index ?? 1) % count;
    this.activeWalk = undefined;
  }
}
