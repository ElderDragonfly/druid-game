import { WOLF } from '../data/wolf';
import { seededRandom, type Rect } from '../world/meadowLayout';
import { WolfNavigation, type WolfPoint } from '../world/WolfNavigation';

export interface WolfState {
  phase: 'idle' | 'wander' | 'chase' | 'attack';
  alerted: boolean;
  elapsed: number;
  walkSpeed: number;
  runSpeed: number;
  target: WolfPoint;
  facingLeft: boolean;
  attackUp: boolean;
}
export class WolfBehavior {
  readonly actorState: WolfState;
  private readonly random: () => number;
  private path: WolfPoint[] = [];
  private pathAge = Infinity;
  private pathGoal?: WolfPoint;
  private idleMs = 0;
  private wanderMs = 0;
  private recoveryMs = 0;

  constructor(readonly navigation: WolfNavigation, start: WolfPoint) {
    this.random = seededRandom(navigation.layout.seed ^ 0x574f4c46);
    this.actorState = { phase: 'idle', alerted: false, elapsed: 0, ...WOLF.stats,
      target: { ...start }, facingLeft: false, attackUp: false };
    this.idleMs = this.pause();
  }

  detects(position: WolfPoint, player: WolfPoint) {
    return ((position.x - player.x) / WOLF.behavior.detectionX) ** 2 +
      ((position.y - player.y) / WOLF.behavior.detectionY) ** 2 <= 1;
  }

  step(delta: number, position: WolfPoint, player: WolfPoint, playerBody: Rect): WolfPoint {
    const s = this.actorState, dt = Math.max(0, delta);
    s.elapsed += dt; this.pathAge += dt; this.recoveryMs = Math.max(0, this.recoveryMs - dt);
    if (!s.alerted && this.detects(position, player)) { s.alerted = true; this.enter('chase'); }
    if (s.phase === 'attack') {
      if (s.elapsed < WOLF.behavior.attackMs) return { x: 0, y: 0 };
      this.recoveryMs = WOLF.behavior.recoveryMs; this.enter('chase');
    }
    if (s.alerted) {
      const dx = Math.max(0, Math.abs(position.x - (playerBody.x + playerBody.width / 2)) - (WOLF.body.width + playerBody.width) / 2);
      const wolfCenterY = position.y - WOLF.body.height / 2;
      const dy = Math.max(0, Math.abs(wolfCenterY - (playerBody.y + playerBody.height / 2)) - (WOLF.body.height + playerBody.height) / 2);
      if (Math.hypot(dx, dy) <= WOLF.behavior.attackGap) {
        if (!this.recoveryMs) {
          s.facingLeft = player.x < position.x;
          s.attackUp = player.y < position.y;
          this.enter('attack');
        }
        return { x: 0, y: 0 };
      }
      s.target = { ...player };
      return this.follow(position, player, s.runSpeed, dt);
    }
    if (s.phase === 'idle') {
      if (s.elapsed >= this.idleMs) this.wander(position);
      return { x: 0, y: 0 };
    }
    if (Math.hypot(s.target.x - position.x, s.target.y - position.y) < 4 || s.elapsed >= this.wanderMs) {
      this.enter('idle'); this.idleMs = this.pause(); return { x: 0, y: 0 };
    }
    return this.follow(position, s.target, s.walkSpeed, dt);
  }

  private follow(position: WolfPoint, goal: WolfPoint, speed: number, delta: number): WolfPoint {
    if (this.pathAge >= WOLF.behavior.pathRefreshMs || !this.pathGoal ||
      Math.hypot(goal.x - this.pathGoal.x, goal.y - this.pathGoal.y) > 48) {
      this.path = this.navigation.route(position, goal); this.pathGoal = { ...goal }; this.pathAge = 0;
    }
    while (this.path.length && Math.hypot(this.path[0].x - position.x, this.path[0].y - position.y) < 4) this.path.shift();
    const next = this.path[0];
    if (!next) return { x: 0, y: 0 };
    const dx = next.x - position.x, dy = next.y - position.y, distance = Math.hypot(dx, dy);
    if (Math.abs(dx) > 1) this.actorState.facingLeft = dx < 0;
    const factor = Math.min(Math.max(0, speed), distance / Math.max(delta / 1000, .001)) / distance;
    return { x: dx * factor, y: dy * factor };
  }

  private wander(position: WolfPoint) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const angle = this.random() * Math.PI * 2;
      const distance = WOLF.behavior.wanderMin + this.random() * (WOLF.behavior.wanderMax - WOLF.behavior.wanderMin);
      const target = { x: position.x + Math.cos(angle) * distance, y: position.y + Math.sin(angle) * distance };
      if (!this.navigation.clear(position, target)) continue;
      this.actorState.target = target; this.enter('wander');
      this.wanderMs = distance / Math.max(1, this.actorState.walkSpeed) * 1000 + 600;
      return;
    }
    this.enter('idle'); this.idleMs = this.pause();
  }
  private pause() { return WOLF.behavior.idleMinMs + this.random() * (WOLF.behavior.idleMaxMs - WOLF.behavior.idleMinMs); }
  private enter(phase: WolfState['phase']) { this.actorState.phase = phase; this.actorState.elapsed = 0; this.pathAge = Infinity; }
}
