import { ENVIRONMENT_VARIANTS, TREE_SPAWN_POOL, environmentVariant } from '../data/environment';
import { seededRandom } from '../world/random';
import type { Rect } from '../world/geometry';
import type { ObstaclePlacement } from '../world/meadowLayout';

export const PATH_ROOM = {
  width: 1600, height: 1000,
  clearing: { x: 160, y: 270, width: 1280, height: 560 },
  gate: { x: 700, width: 200, triggerY: 120 },
} as const;

export interface PathRoomLayout {
  seed: number;
  index: 0 | 1;
  spawn: { x: number; y: number };
  trees: ObstaclePlacement[];
  walls: Rect[];
}

/** Two bounded clearings, with one north exit in the first only. */
export function generatePathRoom(seed: number, index: 0 | 1): PathRoomLayout {
  const random = seededRandom(seed ^ Math.imul(index + 1, 0x3ad12b));
  const variants = ENVIRONMENT_VARIANTS.tree.map((art, i) => TREE_SPAWN_POOL.includes(art.id) ? i : -1).filter(i => i >= 0);
  const trees: ObstaclePlacement[] = [];
  const place = (x: number, y: number, north = false) => {
    const variant = variants[Math.floor(random() * variants.length)];
    const art = environmentVariant('tree', variant);
    let px = x + (random() - .5) * 20;
    // Keep the entire north opening free of crowns, including transparent margins.
    if (north && index === 0) {
      if (x < PATH_ROOM.width / 2) px = Math.min(px, PATH_ROOM.gate.x - 12 - (art.width - art.anchorX) * art.scale);
      else px = Math.max(px, PATH_ROOM.gate.x + PATH_ROOM.gate.width + 12 + art.anchorX * art.scale);
    }
    trees.push({ kind: 'tree', variant, x: px, y: y + (random() - .5) * 48 });
  };
  const row = (from: number, to: number, count: number, y: number, north = false) => {
    for (let i = 0; i < count; i++) place(from + (to - from) * i / (count - 1), y, north);
  };
  if (index === 0) {
    row(72, 602, 4, 255, true);
    row(998, 1528, 4, 255, true);
  } else row(72, 1528, 9, 255);
  row(72, 1528, 9, 990);
  // Corner trees already belong to the horizontal rows; do not double-stack them.
  for (const x of [62, 1538]) for (const y of [490, 725]) place(x, y);

  const c = PATH_ROOM.clearing, gate = PATH_ROOM.gate;
  const walls: Rect[] = [
    { x: 0, y: 0, width: c.x, height: PATH_ROOM.height },
    { x: c.x + c.width, y: 0, width: PATH_ROOM.width - c.x - c.width, height: PATH_ROOM.height },
    { x: c.x, y: c.y + c.height, width: c.width, height: PATH_ROOM.height - c.y - c.height },
  ];
  if (index === 0) walls.push(
    { x: c.x, y: 0, width: gate.x - c.x, height: c.y },
    { x: gate.x + gate.width, y: 0, width: c.x + c.width - gate.x - gate.width, height: c.y },
  );
  else walls.push({ x: c.x, y: 0, width: c.width, height: c.y });

  return { seed: seed >>> 0, index, spawn: { x: 800, y: index === 0 ? 610 : 740 }, trees, walls };
}
