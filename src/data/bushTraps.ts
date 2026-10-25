import { BASE_MOVEMENT_SPEED } from './movement';

/** Prototype hazard: times are independent of the number of artwork frames. */
export const BUSH_TRAPS = {
  warningMs:900, speed:BASE_MOVEMENT_SPEED*2.2, radius:8, damage:1,
  initialDelayMs:1200, restMinMs:900, restMaxMs:1700,
  minPerWave:4, maxPerWave:6, staggerMinMs:200, staggerMaxMs:500,
  minDistance:120, maxDistance:620,
} as const;
