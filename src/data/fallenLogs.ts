import art from '../../docs/art/fallen-logs-v2/sprites.json';
import mushrooms from '../../docs/art/log-mushrooms-v3/sprites.json';

// Keep stable indices for loading existing runs; only the grey trunk spawns.
export const FALLEN_LOGS = art.logs;
export const ACTIVE_LOG_VARIANTS = [4] as const;
export const MUSHROOM_SIZE_MULTIPLIER = 2;
export const LOG_MUSHROOMS = mushrooms.mushrooms.map(sprite => ({
  ...sprite, scale: sprite.scale * art.sizeMultiplier * MUSHROOM_SIZE_MULTIPLIER,
}));
export const FALLEN_LOG_GENERATION = {
  min: 2, max: 4, mushroomChance: .5, mushroomMin: 1, mushroomMax: 3,
  interactionRadius: 44,
  // Temporary inspection layout; disable to restore the world-wide 2–4 rule.
  testAroundSpawn: true,
  testOffsets: [{ x: -220, y: -135 }, { x: 220, y: -135 },
    { x: -220, y: 135 }, { x: 220, y: 135 }],
} as const;
