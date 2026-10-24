import { BUSHES, BUSH_GENERATION as CONFIG } from '../data/bushes';
import { seededRandom } from './random';
import { overlaps, type Rect } from './geometry';
import { obstacleRect, obstacleVisualRect, type MeadowLayout } from './meadowLayout';
import { logVisualRect } from './fallenLogs';
import { stumpClearing } from './stump';
import { ritualTreeClearing } from './rooms';
import { groveInterior, rectTouchesCircle } from './witchGrove';
import { WITCH_CIRCLE } from '../data/witchCircle';

export interface BushPlacement { x: number; y: number; variant: number }
export function bushVisualRect(bush: BushPlacement, scaleFactor = 1): Rect {
  const a = BUSHES[bush.variant], scale = a.scale * scaleFactor;
  return { x: bush.x - a.anchorX * scale, y: bush.y - a.anchorY * scale,
    width: a.width * scale, height: a.height * scale };
}

export function bushInSpawnRoom(layout: Pick<MeadowLayout, 'width' | 'height'>, bush: BushPlacement) {
  const room = groveInterior(layout), r = bushVisualRect(bush);
  return r.x >= room.x && r.y >= room.y &&
    r.x + r.width <= room.x + room.width && r.y + r.height <= room.y + room.height;
}

/** A separate random stream never changes approved trees, logs or creature spawns. */
export function generateBushes(layout: MeadowLayout, protectedActors: readonly Rect[] = []): BushPlacement[] {
  const random = seededRandom(layout.seed ^ 0x42555348);
  const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const count = integer(CONFIG.min, CONFIG.max);
  const room = groveInterior(layout);
  const canopies = layout.obstacles.map(obstacleVisualRect);
  const reserved: Rect[] = [
    ...protectedActors,
    { x: layout.spawn.x - 80, y: layout.spawn.y - 100, width: 160, height: 180 },
    ...layout.obstacles.map(obstacleRect),
    ...(layout.logs ?? []).map(logVisualRect),
    ...(layout.stump ? [stumpClearing(layout.stump)] : []),
    ...(layout.rooms ?? []).flatMap(room => room.tree ? [ritualTreeClearing(room.tree)] : []),
  ];
  const bushes: BushPlacement[] = [];
  const rounded = (value: number, min: number, max: number) =>
    Math.max(Math.ceil(min), Math.min(Math.floor(max), Math.round(value)));
  for (let attempt = 0; attempt < 8000 && bushes.length < count; attempt++) {
    const variant = integer(0, BUSHES.length - 1), a = BUSHES[variant];
    const x = room.x + CONFIG.edge + random() * (room.width - a.width * a.scale - CONFIG.edge * 2);
    const y = room.y + CONFIG.edge + random() * (room.height - a.height * a.scale - CONFIG.edge * 2);
    const bush = {
      x: rounded(x + a.anchorX * a.scale, room.x + CONFIG.edge + a.anchorX * a.scale,
        room.x + room.width - CONFIG.edge - (a.width - a.anchorX) * a.scale),
      y: rounded(y + a.anchorY * a.scale, room.y + CONFIG.edge + a.anchorY * a.scale,
        room.y + room.height - CONFIG.edge - (a.height - a.anchorY) * a.scale), variant,
    };
    const rect = bushVisualRect(bush);
    if(layout.witchCircle&&rectTouchesCircle(rect,layout.witchCircle,WITCH_CIRCLE.clearingRadius))continue;
    if (reserved.some(other => overlaps(rect, other, CONFIG.gap)) ||
      bushes.some(other => overlaps(rect, bushVisualRect(other), CONFIG.gap))) continue;
    // Prefer visible open ground, but dense crowns must not prevent the room
    // from containing its chosen count. Trunk clearance always stays in force.
    if (attempt < 4000 && canopies.some(other => overlaps(rect, other, CONFIG.gap))) continue;
    bushes.push(bush);
  }
  if (bushes.length !== count) throw new Error(`Не удалось разместить ${count} кустов`);
  return bushes;
}
