// Attack rate 1 is the new baseline: the authored 670 ms gesture takes 1005 ms.
// Higher instance rates speed up both the gesture and its projectile release.
export const BASE_ATTACK_RATE = 1;
export const BASE_ATTACK_RANGE = 1;
export const BASE_CAST_DURATION_SCALE = 1.5;

// Authored frame timing; the actual duration scales with attackRate.
export const CAST_FRAME_DURATIONS = [100, 120, 80, 130, 110, 130] as const;
export const CAST_DURATION = CAST_FRAME_DURATIONS.reduce((sum, duration) => sum + duration, 0);
export const CAST_RELEASE_PROGRESS = .75;
export const CAST_RELEASE_MS = CAST_DURATION * CAST_RELEASE_PROGRESS;
