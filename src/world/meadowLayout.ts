export type ObstacleKind = 'tree' | 'bush' | 'stump';
export interface ObstaclePlacement { kind: ObstacleKind; x: number; y: number; variant: number }
export interface Rect { x: number; y: number; width: number; height: number }
export interface MeadowLayout {
  width: number; height: number; seed: number;
  spawn: { x: number; y: number };
  obstacles: ObstaclePlacement[];
}

export const MEADOW_PIXEL_SCALE = 2.5;
// Препятствия совпадают с основанием объекта, кроны остаются навесами.
export const OBSTACLE_SIZES = {
  tree: { textureWidth: 32, textureHeight: 48, bodyWidth: 20, bodyHeight: 14 },
  bush: { textureWidth: 24, textureHeight: 18, bodyWidth: 20, bodyHeight: 12 },
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
  const spawn = { x: width / 2, y: Math.min(height - 58, height / 2 + 140) };
  const obstacles: ObstaclePlacement[] = [{ kind: 'stump', x: width / 2, y: height / 2 + 35, variant: 0 }];
  const spawnArea = { x: spawn.x - 64, y: spawn.y - 58, width: 128, height: 128 };
  const fits = (object: ObstaclePlacement) => {
    const rect = obstacleRect(object);
    return rect.x >= 3 && rect.x + rect.width <= width - 3 && rect.y >= 3 && rect.y + rect.height <= height - 3 &&
      !overlaps(rect, spawnArea, 16) && obstacles.every(other => !overlaps(rect, obstacleRect(other), 32));
  };
  let bushes = 0;
  for (let attempt = 0; attempt < 800 && bushes < 6; attempt++) {
    const object: ObstaclePlacement = {
      kind: 'bush', x: width * 0.23 + random() * width * 0.54,
      y: height * 0.23 + random() * height * 0.55, variant: Math.floor(random() * 3),
    };
    if (fits(object)) { obstacles.push(object); bushes++; }
  }
  const band = Math.min(135, width * 0.18, height * 0.25);
  const treeCount = Math.min(68, Math.max(30, Math.round((width + height) / 38)));
  const beforeTrees = obstacles.length;
  for (let attempt = 0; attempt < 2400 && obstacles.length < treeCount + beforeTrees; attempt++) {
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
  return { width, height, seed, spawn, obstacles };
}
