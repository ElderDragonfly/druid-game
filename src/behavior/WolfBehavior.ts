import { WOLF } from '../data/wolf';
import { seededRandom, type Rect } from '../world/meadowLayout';
import { WolfNavigation, type WolfPoint } from '../world/WolfNavigation';
import type { WolfTimers } from '../persistence/snapshots';

export interface WolfState {
  health: number;
  maxHealth: number;
  phase: 'idle' | 'wander' | 'chase' | 'attack';
  alerted: boolean;
  elapsed: number;
  walkSpeed: number;
  runSpeed: number;
  target: WolfPoint;
  facingLeft: boolean;
  attackUp: boolean;
}
export interface ChasingCreatureDefinition {
  readonly stats: {health:number;walkSpeed:number;runSpeed:number};
  readonly body: {width:number;height:number};
  readonly behavior: typeof WOLF.behavior;
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

  constructor(readonly navigation: WolfNavigation, start: WolfPoint, identity = 0,
    private readonly definition:ChasingCreatureDefinition=WOLF) {
    this.random = seededRandom(navigation.layout.seed ^ 0x574f4c46 ^ identity);
    this.actorState = { phase: 'idle', alerted: false, elapsed: 0, ...definition.stats, maxHealth: definition.stats.health,
      target: { ...start }, facingLeft: false, attackUp: false };
    this.idleMs = this.pause();
  }

  detects(position: WolfPoint, player: WolfPoint) {
    if(this.definition.behavior.detectionX<=0||this.definition.behavior.detectionY<=0)return false;
    return ((position.x - player.x) / this.definition.behavior.detectionX) ** 2 +
      ((position.y - player.y) / this.definition.behavior.detectionY) ** 2 <= 1;
  }

  alert() {
    this.actorState.alerted = true;
    if (this.actorState.phase === 'idle' || this.actorState.phase === 'wander') this.enter('chase');
  }

  snapshotTimers(): WolfTimers {
    return { idleMs: this.idleMs, wanderMs: this.wanderMs, recoveryMs: this.recoveryMs };
  }

  restoreTimers(saved: WolfTimers) {
    this.idleMs = saved.idleMs; this.wanderMs = saved.wanderMs; this.recoveryMs = saved.recoveryMs;
    this.path = []; this.pathGoal = undefined; this.pathAge = Infinity;
  }

  step(delta: number, position: WolfPoint, player: WolfPoint, playerBody: Rect): WolfPoint {
    const s = this.actorState, dt = Math.max(0, delta);
    s.elapsed += dt; this.pathAge += dt; this.recoveryMs = Math.max(0, this.recoveryMs - dt);
    if (!s.alerted && this.detects(position, player)) this.alert();
    if (s.phase === 'attack') {
      if (s.elapsed < this.definition.behavior.attackMs) return { x: 0, y: 0 };
      this.recoveryMs = this.definition.behavior.recoveryMs; this.enter('chase');
    }
    if (s.alerted) {
      if (this.inAttackRange(position, playerBody)) {
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

  inAttackRange(position: WolfPoint, playerBody: Rect) {
    const dx = Math.max(0, Math.abs(position.x - (playerBody.x + playerBody.width / 2)) - (this.definition.body.width + playerBody.width) / 2);
    const dy = Math.max(0, Math.abs(position.y - this.definition.body.height / 2 - (playerBody.y + playerBody.height / 2)) - (this.definition.body.height + playerBody.height) / 2);
    return Math.hypot(dx, dy) <= this.definition.behavior.attackGap;
  }

  private follow(position: WolfPoint, goal: WolfPoint, speed: number, delta: number): WolfPoint {
    if (this.pathAge >= this.definition.behavior.pathRefreshMs || !this.pathGoal ||
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
      const distance = this.definition.behavior.wanderMin + this.random() * (this.definition.behavior.wanderMax - this.definition.behavior.wanderMin);
      const target = { x: position.x + Math.cos(angle) * distance, y: position.y + Math.sin(angle) * distance };
      if (!this.navigation.clear(position, target)) continue;
      this.actorState.target = target; this.enter('wander');
      this.wanderMs = distance / Math.max(1, this.actorState.walkSpeed) * 1000 + 600;
      return;
    }
    this.enter('idle'); this.idleMs = this.pause();
  }
  private pause() { return this.definition.behavior.idleMinMs + this.random() * (this.definition.behavior.idleMaxMs - this.definition.behavior.idleMinMs); }
  private enter(phase: WolfState['phase']) { this.actorState.phase = phase; this.actorState.elapsed = 0; this.pathAge = Infinity; }
}
