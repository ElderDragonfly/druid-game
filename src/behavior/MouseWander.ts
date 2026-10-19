import { MOUSE } from '../data/mouse';
import { obstacleRect, overlaps, seededRandom, type MeadowLayout } from '../world/meadowLayout';

export interface MousePoint { x: number; y: number }
export type MouseState = 'run' | 'rise' | 'look' | 'lower';
export interface MouseActorState { phase: MouseState; elapsed: number; target: MousePoint; speed: number }

export function mouseCanStand(layout: MeadowLayout, point: MousePoint, gap = 3) {
  const { x, y } = point;
  return x >= 32 && y >= 40 && x <= layout.width - 32 && y <= layout.height - 12 &&
    !layout.obstacles.some(object => overlaps({ x: x - MOUSE.bodyWidth / 2, y: y - MOUSE.bodyHeight,
      width: MOUSE.bodyWidth, height: MOUSE.bodyHeight }, obstacleRect(object), gap));
}

/** A peaceful state machine. It has no player reference, sight radius or attack state. */
export class MouseWander {
  readonly actorState: MouseActorState;
  get state() { return this.actorState.phase; }
  get elapsed() { return this.actorState.elapsed; }
  get target() { return this.actorState.target; }
  get runTimeLimit() { return this.runLimit; }
  private random: () => number;
  private runLimit = 0;

  constructor(private layout: MeadowLayout, start: MousePoint, instanceSeed = 0) {
    this.actorState = { phase: 'run', elapsed: 0, target: { ...start }, speed: MOUSE.speed };
    this.random = seededRandom(layout.seed ^ 0x57414e44 ^ instanceSeed);
    this.actorState.target = this.destination(start);
  }

  step(delta: number, position: MousePoint, blocked = false): MousePoint {
    this.actorState.elapsed += Math.max(0, delta);
    if (this.state === 'run') {
      const dx = this.target.x - position.x, dy = this.target.y - position.y, distance = Math.hypot(dx, dy);
      if (distance > 2 && this.elapsed < this.runLimit && !(blocked && this.elapsed > 100)) {
        return { x: dx / distance * Math.max(0, this.actorState.speed), y: dy / distance * Math.max(0, this.actorState.speed) };
      }
      this.enter('rise');
    } else if (this.state === 'rise' && this.elapsed >= MOUSE.transitionMs) this.enter('look');
    else if (this.state === 'look' && this.elapsed >= MOUSE.lookMs) this.enter('lower');
    else if (this.state === 'lower' && this.elapsed >= MOUSE.transitionMs) {
      this.actorState.target = this.destination(position);
      this.enter('run');
    }
    return { x: 0, y: 0 };
  }

  restore(state: MouseActorState, runLimit: number) {
    Object.assign(this.actorState, state, { target: { ...state.target } }); this.runLimit = runLimit;
  }

  private enter(state: MouseState) { this.actorState.phase = state; this.actorState.elapsed = 0; }

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
