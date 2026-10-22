import type { Facing } from '../input/EightWayFacing';
import type { CastSave } from '../persistence/snapshots';
import { BASE_ATTACK_RATE, BASE_CAST_DURATION_SCALE, CAST_DURATION, CAST_FRAME_DURATIONS, CAST_RELEASE_MS } from '../data/attack';

// The six moving phases of the accepted cast-down-v1. Preview-only pauses
// before/after the gesture are not part of gameplay.
export { CAST_FRAME_DURATIONS, CAST_DURATION } from '../data/attack';

/** Casting has its own clock, independent of walking speed and key repeat. */
export class DruidCasting {
  facing: Facing = 'down';
  active = false;
  private elapsed = 0;
  private released = false;
  private pendingRelease?: Facing;

  constructor(readonly releaseAtMs = CAST_RELEASE_MS, private readonly attackRate: () => number = () => BASE_ATTACK_RATE) {}

  update(delta: number, requested?: Facing) {
    if(this.attackRate()<=0) { this.cancel(); return; }
    if (this.active) {
      if (requested) this.facing = requested;
      this.elapsed += Math.max(0, delta) * Math.max(0, this.attackRate()) / BASE_CAST_DURATION_SCALE;
      if (!this.released && this.elapsed >= this.releaseAtMs) {
        this.pendingRelease = this.facing; this.released = true;
      }
      // A normally completed gesture keeps its release until the world consumes
      // it, including a long frame crossing both release and end. Interruptions
      // use cancel(), which clears it before the post-physics release phase.
      if (this.elapsed >= CAST_DURATION) { this.active = false; this.elapsed = 0; }
    }
    if (requested) {
      if (!this.active) { this.elapsed = 0; this.released = false; }
      this.active = true;
      // Adding a second arrow switches view at the current phase instead of
      // restarting: diagonals also work when keys arrive on adjacent frames.
      this.facing = requested;
    }
  }

  get frameIndex() {
    let end = 0;
    for (let i = 0; i < CAST_FRAME_DURATIONS.length; i++) {
      end += CAST_FRAME_DURATIONS[i];
      if (this.elapsed < end) return i;
    }
    return CAST_FRAME_DURATIONS.length - 1;
  }

  cancel() {
    this.active = false;
    this.elapsed = 0; this.released = false; this.pendingRelease = undefined;
  }

  consumeRelease() {
    const facing = this.pendingRelease; this.pendingRelease = undefined; return facing;
  }

  snapshot(): CastSave {
    return { active: this.active, facing: this.facing, elapsed: this.elapsed,
      released: this.released, pendingRelease: this.pendingRelease };
  }

  restore(saved: CastSave) {
    this.active = saved.active; this.facing = saved.facing; this.elapsed = saved.elapsed;
    this.released = saved.released; this.pendingRelease = saved.pendingRelease;
  }
}
