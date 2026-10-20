import art from '../../docs/art/fallen-logs-v2/sprites.json';
import original from '../../docs/art/fallen-logs-v1/sprites.json';

export const FALLEN_LOGS = art.logs;
export const LOG_MUSHROOMS = original.mushrooms.map(sprite => ({
  ...sprite, scale: sprite.scale * art.sizeMultiplier,
}));
export const FALLEN_LOG_GENERATION = {
  min: 2, max: 4, mushroomChance: .5, mushroomMin: 1, mushroomMax: 3,
  angleMin: 0, angleMax: 0,
} as const;
