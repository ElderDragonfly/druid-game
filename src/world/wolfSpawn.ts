import { WOLF } from '../data/wolf';
import { seededRandom } from './meadowLayout';
import type { WolfNavigation, WolfPoint } from './WolfNavigation';

/** The same reachable, unseen spawn rule at the start and for replacements. */
export function wolfSpawn(navigation: WolfNavigation, generation = 0,
  center: WolfPoint = { x: navigation.layout.spawn.x, y: navigation.layout.spawn.y + 22.5 },
  occupied: readonly WolfPoint[] = []): WolfPoint {
  const random = seededRandom(navigation.layout.seed ^ 0x53505746 ^ generation);
  for (let attempt = 0; attempt < 400; attempt++) {
    const angle = random() * Math.PI * 2, factor = 1.2 + random() * .2;
    const p = { x: center.x + Math.cos(angle) * WOLF.behavior.detectionX * factor,
      y: center.y + Math.sin(angle) * WOLF.behavior.detectionY * factor };
    if (navigation.canStand(p) && occupied.every(other=>Math.hypot(p.x-other.x,p.y-other.y)>=WOLF.population.spacing) &&
      navigation.route(p, center).length) return p;
  }
  throw new Error('No reachable wolf spawn outside the detection ellipse');
}
