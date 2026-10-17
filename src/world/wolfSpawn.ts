import { WOLF } from '../data/wolf';
import { seededRandom } from './meadowLayout';
import type { WolfNavigation, WolfPoint } from './WolfNavigation';

/** Exactly one wolf, outside the detection ellipse and within a short walk of the start. */
export function wolfSpawn(navigation: WolfNavigation): WolfPoint {
  const random = seededRandom(navigation.layout.seed ^ 0x53505746), center = navigation.layout.spawn;
  for (let attempt = 0; attempt < 400; attempt++) {
    const angle = random() * Math.PI * 2, factor = 1.2 + random() * .2;
    const p = { x: center.x + Math.cos(angle) * WOLF.behavior.detectionX * factor,
      y: center.y + 22.5 + Math.sin(angle) * WOLF.behavior.detectionY * factor };
    if (navigation.canStand(p) && navigation.route(p, center).length) return p;
  }
  throw new Error('No reachable wolf spawn outside the detection ellipse');
}
