import type { Facing } from '../input/EightWayFacing';
import type { HitSave } from '../persistence/snapshots';

export const HIT_FRAME_DURATIONS = [40, 70, 120, 100, 70] as const;
export const HIT_DURATION = HIT_FRAME_DURATIONS.reduce((sum, ms) => sum + ms, 0);

/** A short, uninterruptible flinch. It neither changes HP nor applies knockback. */
export class DruidHitReaction {
  active = false;
  facing: Facing = 'down';
  private elapsed = 0;

  start(facing: Facing) {
    if (this.active) return false;
    this.facing = facing; this.elapsed = 0; this.active = true;
    return true;
  }
  update(delta: number) {
    if (!this.active) return;
    this.elapsed += Math.max(0, delta);
    if (this.elapsed >= HIT_DURATION) this.cancel();
  }
  get frameIndex() {
    let end = 0;
    for (let index = 0; index < HIT_FRAME_DURATIONS.length; index++) {
      end += HIT_FRAME_DURATIONS[index];
      if (this.elapsed < end) return index;
    }
    return HIT_FRAME_DURATIONS.length - 1;
  }
  cancel() { this.active = false; this.elapsed = 0; }
  snapshot(): HitSave { return { active: this.active, facing: this.facing, elapsed: this.elapsed }; }
  restore(saved: HitSave) { this.active = saved.active; this.facing = saved.facing; this.elapsed = saved.elapsed; }
}
