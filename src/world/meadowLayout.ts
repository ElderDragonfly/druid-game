import { generateFallenLogs, type FallenLogPlacement } from './fallenLogs';
import { seededRandom } from './random';
import { overlaps, type Rect } from './geometry';
export { seededRandom } from './random';
export { overlaps, type Rect } from './geometry';
import { ENVIRONMENT_VARIANTS, TREE_SPAWN_POOL, environmentVariant, type EnvironmentKind } from '../data/environment';

export type ObstacleKind = EnvironmentKind;
export interface ObstaclePlacement { kind: ObstacleKind; x: number; y: number; variant: number }
export interface MeadowLayout {
  width: number; height: number; seed: number;
  counts: { trees: number; logs?: number };
  spawn: { x: number; y: number };
  obstacles: ObstaclePlacement[];
  /** Missing only in older saved runs. */
  logs?: FallenLogPlacement[];
}

export const MEADOW_PIXEL_SCALE = 2.5;
export const MEADOW_WORLD = {
  width: 3840, height: 2160,
  viewHeight: 720,
  cameraRadiusX: 192, cameraRadiusY: 108,
  cameraResponseMs: 140,
} as const;

export const MEADOW_GENERATION = {
  trees: { min: 70, max: 99 },
  obstacleGap: 28,
  spawnClearance: 16,
} as const;

export function obstacleRect(object: ObstaclePlacement): Rect {
  const art = environmentVariant(object.kind, object.variant);
  return { x: object.x - art.bodyWidth / 2, y: object.y - art.bodyHeight,
    width: art.bodyWidth, height: art.bodyHeight - (art.bodyInsetBottom ?? 0) };
}

export function obstacleVisualRect(object: ObstaclePlacement): Rect {
  const art = environmentVariant(object.kind, object.variant);
  return { x: object.x - art.anchorX * art.scale, y: object.y - art.anchorY * art.scale,
    width: art.width * art.scale, height: art.height * art.scale };
}

export function generateMeadow(seed: number, treePool: readonly string[] = TREE_SPAWN_POOL): MeadowLayout {
  const { width, height } = MEADOW_WORLD;
  const random = seededRandom(seed);
  const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const treeVariants = ENVIRONMENT_VARIANTS.tree.flatMap((art, index) => treePool.includes(art.id) ? [index] : []);
  const trees = treeVariants.length ? integer(MEADOW_GENERATION.trees.min, MEADOW_GENERATION.trees.max) : 0;
  const spawn = { x: width / 2, y: height / 2 };
  const spawnArea = { x: spawn.x - 64, y: spawn.y - 58, width: 128, height: 128 };
  // Counts are drawn once; retries preserve the chosen range and deterministic seed.
  for (let layoutAttempt = 0; layoutAttempt < 32; layoutAttempt++) {
    const obstacles: ObstaclePlacement[] = [];
    const fits = (object: ObstaclePlacement) => {
      const rect = obstacleRect(object);
      return !overlaps(rect, spawnArea, MEADOW_GENERATION.spawnClearance) &&
        !overlaps(obstacleVisualRect(object), spawnArea) &&
        obstacles.every(other => !overlaps(rect, obstacleRect(other), MEADOW_GENERATION.obstacleGap));
    };
    for (const [kind, count] of [['tree', trees]] as const) {
      let placed = 0;
      for (let attempt = 0; attempt < 1200 && placed < count; attempt++) {
        const variant = treeVariants[integer(0, treeVariants.length - 1)];
        const art = environmentVariant(kind, variant);
        const left = art.anchorX * art.scale + 3, right = (art.width - art.anchorX) * art.scale + 3;
        const top = art.anchorY * art.scale + 3, bottom = (art.height - art.anchorY) * art.scale + 3;
        const object: ObstaclePlacement = {
          kind,
          x: left + random() * (width - left - right),
          y: top + random() * (height - top - bottom),
          variant,
        };
        if (fits(object)) { obstacles.push(object); placed++; }
      }
      if (placed !== count) break;
    }
    if (obstacles.length === trees) {
      const layout:MeadowLayout={ width, height, seed, counts: { trees }, spawn, obstacles };
      layout.logs=generateFallenLogs(layout,obstacles.map(obstacleRect),obstacles.map(obstacleVisualRect));
      layout.counts.logs=layout.logs.length;
      return layout;
    }
  }
  throw new Error(`Не удалось разместить поляну ${width}×${height}: ${trees} деревьев`);
}
