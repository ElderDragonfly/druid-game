export type ObstacleKind = 'tree' | 'bush' | 'stump';
export interface ObstaclePlacement { kind: ObstacleKind; x: number; y: number; variant: number }
export interface Rect { x: number; y: number; width: number; height: number }
export interface MeadowLayout {
  width: number; height: number; seed: number;
  counts: { trees: number; bushes: number };
  spawn: { x: number; y: number };
  obstacles: ObstaclePlacement[];
}

export const MEADOW_PIXEL_SCALE = 2.5;
export const MEADOW_WORLD = {
  width: 3840, height: 2160,
  viewHeight: 720,
  cameraRadius: 108,
  cameraResponseMs: 140,
} as const;

export const MEADOW_GENERATION = {
  trees: { min: 45, max: 63 },
  bushes: { min: 4, max: 7 },
  obstacleGap: 28,
  spawnClearance: 16,
} as const;

// Препятствия совпадают с основанием объекта, кроны остаются навесами.
export const OBSTACLE_SIZES = {
  tree: { textureWidth: 44, textureHeight: 44, bodyWidth: 20, bodyHeight: 14 },
  bush: { textureWidth: 28, textureHeight: 22, bodyWidth: 20, bodyHeight: 12 },
  stump: { textureWidth: 64, textureHeight: 44, bodyWidth: 52, bodyHeight: 28 },
} as const;

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function obstacleRect(object: ObstaclePlacement): Rect {
  const size = OBSTACLE_SIZES[object.kind];
  const width = size.bodyWidth * MEADOW_PIXEL_SCALE;
  const height = size.bodyHeight * MEADOW_PIXEL_SCALE;
  return { x: object.x - width / 2, y: object.y - height, width, height };
}

export function overlaps(a: Rect, b: Rect, gap = 0) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

export function generateMeadow(seed: number): MeadowLayout {
  const { width, height } = MEADOW_WORLD;
  const random = seededRandom(seed);
  const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const trees = integer(MEADOW_GENERATION.trees.min, MEADOW_GENERATION.trees.max);
  const bushes = integer(MEADOW_GENERATION.bushes.min, MEADOW_GENERATION.bushes.max);
  const spawn = { x: width / 2, y: height / 2 };
  const spawnArea = { x: spawn.x - 64, y: spawn.y - 58, width: 128, height: 128 };
  // Counts are drawn once; retries preserve the chosen range and deterministic seed.
  for (let layoutAttempt = 0; layoutAttempt < 32; layoutAttempt++) {
    const obstacles: ObstaclePlacement[] = [];
    const fits = (object: ObstaclePlacement) => {
      const rect = obstacleRect(object);
      return !overlaps(rect, spawnArea, MEADOW_GENERATION.spawnClearance) &&
        obstacles.every(other => !overlaps(rect, obstacleRect(other), MEADOW_GENERATION.obstacleGap));
    };
    for (const [kind, count] of [['bush', bushes], ['tree', trees]] as const) {
      const size = OBSTACLE_SIZES[kind];
      const marginX = size.textureWidth * MEADOW_PIXEL_SCALE / 2 + 3;
      const marginTop = size.textureHeight * MEADOW_PIXEL_SCALE + 3;
      let placed = 0;
      for (let attempt = 0; attempt < 1200 && placed < count; attempt++) {
        const object: ObstaclePlacement = {
          kind,
          x: marginX + random() * (width - marginX * 2),
          y: marginTop + random() * (height - marginTop - 3),
          variant: integer(0, 2),
        };
        if (fits(object)) { obstacles.push(object); placed++; }
      }
      if (placed !== count) break;
    }
    if (obstacles.length === trees + bushes) {
      return { width, height, seed, counts: { trees, bushes }, spawn, obstacles };
    }
  }
  throw new Error(`Не удалось разместить поляну ${width}×${height}: ${trees} деревьев, ${bushes} кустов`);
}
