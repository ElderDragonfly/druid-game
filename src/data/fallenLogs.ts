import art from '../../docs/art/fallen-logs-v1/sprites.json';

export const FALLEN_LOGS = art.logs;
export const LOG_MUSHROOMS = art.mushrooms;
export const FALLEN_LOG_GENERATION = {
  min: 2, max: 4, mushroomChance: .5, mushroomMin: 1, mushroomMax: 3,
  angleMin: -35, angleMax: 35,
} as const;
