import { MOUSE } from '../data/mouse';
import { obstacleRect, obstacleVisualRect, overlaps, seededRandom, type MeadowLayout } from '../world/meadowLayout';

export interface MousePoint { x: number; y: number }
export type MouseState = 'run' | 'rise' | 'look' | 'lower';

export function mouseCanStand(layout: MeadowLayout, point: MousePoint, gap = 3) {
  const { x, y } = point;
  return x >= 32 && y >= 40 && x <= layout.width - 32 && y <= layout.height - 12 &&
    !layout.obstacles.some(object => overlaps({ x: x - MOUSE.bodyWidth / 2, y: y - MOUSE.bodyHeight,
      width: MOUSE.bodyWidth, height: MOUSE.bodyHeight }, obstacleRect(object), gap));
}

export function mouseSpawn(layout: MeadowLayout): MousePoint {
  const random = seededRandom(layout.seed ^ 0x4d4f5553);
  for (let attempt = 0; attempt < 256; attempt++) {
    const angle = random() * Math.PI * 2;
    const distance = MOUSE.spawnDistance.min + random() * (MOUSE.spawnDistance.max - MOUSE.spawnDistance.min);
    const point = { x: layout.spawn.x + Math.cos(angle) * distance, y: layout.spawn.y + Math.sin(angle) * distance };
    const visible = !layout.obstacles.some(object => overlaps({ x: point.x - 30, y: point.y - 38, width: 60, height: 42 },
      obstacleVisualRect(object)));
    if (mouseCanStand(layout, point) && visible) return point;
  }
  // The druid's spawn clearing is guaranteed to be free of trees.
  return { x: layout.spawn.x + 44, y: layout.spawn.y + 36 };
}

/** A peaceful state machine. It has no player reference, sight radius or attack state. */
export class MouseWander {
  state: MouseState = 'run';
  elapsed = 0;
  target: MousePoint;
  private random: () => number;
  private runLimit = 0;

  constructor(private layout: MeadowLayout, start: MousePoint) {
    this.random = seededRandom(layout.seed ^ 0x57414e44);
    this.target = this.destination(start);
  }

  step(delta: number, position: MousePoint, blocked = false): MousePoint {
    this.elapsed += Math.max(0, delta);
    if (this.state === 'run') {
      const dx = this.target.x - position.x, dy = this.target.y - position.y, distance = Math.hypot(dx, dy);
      if (distance > 2 && this.elapsed < this.runLimit && !(blocked && this.elapsed > 100)) {
        return { x: dx / distance * MOUSE.speed, y: dy / distance * MOUSE.speed };
      }
      this.enter('rise');
    } else if (this.state === 'rise' && this.elapsed >= MOUSE.transitionMs) this.enter('look');
    else if (this.state === 'look' && this.elapsed >= MOUSE.lookMs) this.enter('lower');
    else if (this.state === 'lower' && this.elapsed >= MOUSE.transitionMs) {
      this.target = this.destination(position);
      this.enter('run');
    }
    return { x: 0, y: 0 };
  }

  private enter(state: MouseState) { this.state = state; this.elapsed = 0; }

  private destination(start: MousePoint): MousePoint {
    for (let attempt = 0; attempt < 48; attempt++) {
      const angle = this.random() * Math.PI * 2;
      const distance = MOUSE.runDistance.min + this.random() * (MOUSE.runDistance.max - MOUSE.runDistance.min);
      const point = { x: start.x + Math.cos(angle) * distance, y: start.y + Math.sin(angle) * distance };
      const steps = Math.ceil(distance / 6);
      if (Array.from({ length: steps + 1 }, (_, i) => ({ x: start.x + (point.x - start.x) * i / steps,
        y: start.y + (point.y - start.y) * i / steps })).every(p => mouseCanStand(this.layout, p))) {
        this.runLimit = distance / MOUSE.speed * 1000 + 350;
        return point;
      }
    }
    this.runLimit = 0;
    return { ...start };
  }
}
