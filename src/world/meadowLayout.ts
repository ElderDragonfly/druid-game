export type ObstacleKind = 'tree' | 'bush' | 'stump';
export interface ObstaclePlacement { kind: ObstacleKind; x: number; y: number; variant: number }
export interface Rect { x: number; y: number; width: number; height: number }
export interface MeadowLayout {
  width: number; height: number; seed: number;
  counts: { trees: number; bushes: number; treeBase: number };
  spawn: { x: number; y: number };
  obstacles: ObstaclePlacement[];
}

export const MEADOW_PIXEL_SCALE = 2.5;
export const MEADOW_MIN_HEIGHT = 405;
export const MEADOW_GENERATION = {
  bushes: { min: 4, max: 7 },
  treeVariation: 4,
  obstacleGap: 28,
  spawnClearance: 16,
} as const;

// Средняя фактическая плотность принятой комнаты, измеренная до изменения.
// Доля высоты от ширины позволяет сохранить её на разных пропорциях окна.
const TREE_BASELINES = [
  { ratio: 200 / 960, count: 9 },
  { ratio: 270 / 960, count: 14 },
  { ratio: 320 / 960, count: 17 },
  { ratio: 360 / 960, count: 21 },
  { ratio: 405 / 960, count: 25 },
  { ratio: 540 / 960, count: 35 },
  { ratio: 640 / 960, count: 41 },
  { ratio: 716 / 960, count: 43 },
  { ratio: 960 / 960, count: 51 },
  { ratio: 1440 / 960, count: 63 },
];

export function treeBaseline(width: number, height: number) {
  const ratio = height / width;
  if (ratio <= TREE_BASELINES[0].ratio) {
    return Math.max(5, Math.round(TREE_BASELINES[0].count * ratio / TREE_BASELINES[0].ratio));
  }
  for (let i = 1; i < TREE_BASELINES.length; i++) {
    const left = TREE_BASELINES[i - 1];
    const right = TREE_BASELINES[i];
    if (ratio <= right.ratio) {
      return Math.round(left.count + (right.count - left.count) * (ratio - left.ratio) / (right.ratio - left.ratio));
    }
  }
  return 63;
}
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

export function generateMeadow(width: number, height: number, seed: number): MeadowLayout {
  const random = seededRandom(seed);
  const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const treeBase = treeBaseline(width, height);
  const trees = integer(treeBase - MEADOW_GENERATION.treeVariation, treeBase + MEADOW_GENERATION.treeVariation);
  const bushes = integer(MEADOW_GENERATION.bushes.min, MEADOW_GENERATION.bushes.max);
  const spawn = { x: width / 2, y: Math.min(height - 58, height / 2 + 140) };
  const spawnArea = { x: spawn.x - 64, y: spawn.y - 58, width: 128, height: 128 };
  // Если не хватило свободных мест, пробуем другую раскладку с теми же числами.
  // Количество выбирается один раз, поэтому сложные раскладки не меняют распределение.
  for (let layoutAttempt = 0; layoutAttempt < 32; layoutAttempt++) {
    const obstacles: ObstaclePlacement[] = [{ kind: 'stump', x: width / 2, y: height / 2 + 35, variant: 0 }];
    const fits = (object: ObstaclePlacement) => {
      const rect = obstacleRect(object);
      return rect.x >= 3 && rect.x + rect.width <= width - 3 && rect.y >= 3 && rect.y + rect.height <= height - 3 &&
        !overlaps(rect, spawnArea, MEADOW_GENERATION.spawnClearance) &&
        obstacles.every(other => !overlaps(rect, obstacleRect(other), MEADOW_GENERATION.obstacleGap));
    };
    let placedBushes = 0;
    for (let attempt = 0; attempt < 1200 && placedBushes < bushes; attempt++) {
      const object: ObstaclePlacement = {
        kind: 'bush', x: width * 0.23 + random() * width * 0.54,
        y: height * 0.23 + random() * height * 0.55, variant: Math.floor(random() * 3),
      };
      if (fits(object)) { obstacles.push(object); placedBushes++; }
    }
    if (placedBushes !== bushes) continue;
    const band = Math.min(135, width * 0.18, height * 0.25);
    const beforeTrees = obstacles.length;
    for (let attempt = 0; attempt < 4000 && obstacles.length < trees + beforeTrees; attempt++) {
      const edge = Math.floor(random() * 4);
      // Квадрат случайного значения сгущает деревья у самого края.
      const distance = 32 + random() ** 2 * band;
      let x = 32 + random() * (width - 64);
      let y = 44 + random() * (height - 58);
      if (edge === 0) x = distance;
      if (edge === 1) x = width - distance;
      if (edge === 2) y = distance + 10;
      if (edge === 3) y = height - distance;
      const object: ObstaclePlacement = { kind: 'tree', x, y, variant: Math.floor(random() * 3) };
      if (fits(object)) obstacles.push(object);
    }
    if (obstacles.length === trees + beforeTrees) {
      return { width, height, seed, counts: { trees, bushes, treeBase }, spawn, obstacles };
    }
  }
  throw new Error(`Не удалось разместить поляну ${width}×${height}: ${trees} деревьев, ${bushes} кустов`);
}
