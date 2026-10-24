import { BUSHES, BUSH_GENERATION as CONFIG } from '../data/bushes';
import { seededRandom } from './random';
import { overlaps, type Rect } from './geometry';
import { obstacleVisualRect, type MeadowLayout } from './meadowLayout';
import { logVisualRect } from './fallenLogs';
import { stumpClearing } from './stump';
import { ritualTreeClearing } from './rooms';

export interface BushPlacement { x: number; y: number; variant: number }
export function bushVisualRect(bush: BushPlacement): Rect {
  const a = BUSHES[bush.variant];
  return { x: bush.x - a.anchorX * a.scale, y: bush.y - a.anchorY * a.scale,
    width: a.width * a.scale, height: a.height * a.scale };
}

/** A separate random stream never changes approved trees, logs or creature spawns. */
export function generateBushes(layout: MeadowLayout): BushPlacement[] {
  const random = seededRandom(layout.seed ^ 0x42555348);
  const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const count = integer(CONFIG.min, CONFIG.max);
  const reserved: Rect[] = [
    { x: layout.spawn.x - 80, y: layout.spawn.y - 100, width: 160, height: 180 },
    ...layout.obstacles.map(obstacleVisualRect),
    ...(layout.logs ?? []).map(logVisualRect),
    ...(layout.stump ? [stumpClearing(layout.stump)] : []),
    ...(layout.rooms ?? []).flatMap(room => room.tree ? [ritualTreeClearing(room.tree)] : []),
  ];
  const bushes: BushPlacement[] = [];
  for (let attempt = 0; attempt < 4000 && bushes.length < count; attempt++) {
    const variant = integer(0, BUSHES.length - 1), a = BUSHES[variant];
    const x = CONFIG.edge + random() * (layout.width - a.width * a.scale - CONFIG.edge * 2);
    const y = CONFIG.edge + random() * (layout.height - a.height * a.scale - CONFIG.edge * 2);
    const bush = { x: Math.round(x + a.anchorX * a.scale), y: Math.round(y + a.anchorY * a.scale), variant };
    const rect = bushVisualRect(bush);
    if (reserved.some(other => overlaps(rect, other, CONFIG.gap)) ||
      bushes.some(other => overlaps(rect, bushVisualRect(other), CONFIG.gap))) continue;
    bushes.push(bush);
  }
  if (bushes.length !== count) throw new Error(`Не удалось разместить ${count} кустов`);
  return bushes;
}
