import { MOUSE } from '../data/mouse';
import { mouseCanStand, type MousePoint } from '../behavior/MouseWander';
import { seededRandom, type MeadowLayout } from './meadowLayout';

/** One draw for the whole world. No cells, per-screen limits or forced neighbour. */
export function generateMousePopulation(layout: MeadowLayout): MousePoint[] {
  const random = seededRandom(layout.seed ^ 0x4d4f5553);
  const count = MOUSE.population.min + Math.floor(random() * (MOUSE.population.max - MOUSE.population.min + 1));
  const points: MousePoint[] = [];
  for (let attempt = 0; attempt < 4096 && points.length < count; attempt++) {
    const point = { x: 32 + random() * (layout.width - 64), y: 40 + random() * (layout.height - 52) };
    if (mouseCanStand(layout, point) && points.every(other => Math.hypot(point.x - other.x, point.y - other.y) >= 12)) {
      points.push(point);
    }
  }
  return points;
}
