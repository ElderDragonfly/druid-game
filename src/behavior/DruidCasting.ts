import type { Facing } from '../input/EightWayFacing';

// The six moving phases of the accepted cast-down-v1. Preview-only pauses
// before/after the gesture are not part of gameplay.
export const CAST_FRAME_DURATIONS = [100, 120, 80, 130, 110, 130] as const;
export const CAST_DURATION = CAST_FRAME_DURATIONS.reduce((sum, duration) => sum + duration, 0);

/** Casting has its own clock, independent of walking speed and key repeat. */
export class DruidCasting {
  facing: Facing = 'down';
  active = false;
  private elapsed = 0;

  update(delta: number, requested?: Facing) {
    if (this.active) {
      this.elapsed += Math.max(0, delta);
      if (this.elapsed >= CAST_DURATION) this.cancel();
    }
    if (requested) {
      if (!this.active) this.elapsed = 0;
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
    this.elapsed = 0;
  }
}
