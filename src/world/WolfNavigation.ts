import { layoutCollisionRects } from './collision';
import { WOLF } from '../data/wolf';
import { overlaps, type MeadowLayout, type Rect } from './meadowLayout';

export interface WolfPoint { x: number; y: number }
/** Feet coordinates throughout: navigation and Arcade use the same footprint. */
export class WolfNavigation {
  private readonly trunks: readonly Rect[];
  private readonly cell = 24;
  private readonly columns: number;
  private readonly rows: number;
  private readonly free: Uint8Array;

  constructor(readonly layout: MeadowLayout, private readonly footprint: {width:number;height:number}=WOLF.body) {
    this.trunks = layoutCollisionRects(layout);
    this.columns = Math.ceil(layout.width / this.cell);
    this.rows = Math.ceil(layout.height / this.cell);
    this.free = Uint8Array.from({ length: this.columns * this.rows }, (_, i) => Number(this.canStand(this.point(i))));
  }

  canStand(p: WolfPoint, gap = 2) {
    const { width, height } = this.footprint;
    const rect = { x: p.x - width / 2, y: p.y - height, width, height };
    return rect.x >= gap && rect.y >= gap && rect.x + width <= this.layout.width - gap &&
      rect.y + height <= this.layout.height - gap && !this.trunks.some(tree => overlaps(rect, tree, gap));
  }

  clear(a: WolfPoint, b: WolfPoint, gap = 2) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6));
    for (let i = 0; i <= steps; i++) {
      if (!this.canStand({ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }, gap)) return false;
    }
    return true;
  }

  route(start: WolfPoint, goal: WolfPoint): WolfPoint[] {
    if (this.clear(start, goal)) return [{ ...goal }];
    const from = this.nearest(start), to = this.nearest(goal, false);
    if (from < 0 || to < 0) return [];
    const costs = new Float64Array(this.free.length).fill(Infinity);
    const parents = new Int32Array(this.free.length).fill(-1);
    const closed = new Uint8Array(this.free.length);
    const heap: { id: number; score: number }[] = [];
    const push = (id: number, score: number) => {
      let i = heap.length; heap.push({ id, score });
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (heap[parent].score <= score) break;
        heap[i] = heap[parent]; i = parent;
      }
      heap[i] = { id, score };
    };
    const pop = () => {
      const first = heap[0], last = heap.pop()!;
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let child = i * 2 + 1;
          if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
          if (heap[child].score >= last.score) break;
          heap[i] = heap[child]; i = child;
        }
        heap[i] = last;
      }
      return first.id;
    };
    costs[from] = 0; push(from, 0);
    while (heap.length) {
      const id = pop();
      if (closed[id]) continue;
      if (id === to) {
        const path: WolfPoint[] = [];
        for (let n = to; n !== -1; n = parents[n]) path.push(this.point(n));
        path.reverse();
        if (this.clear(path[path.length - 1], goal)) path.push({ ...goal });
        // Skip grid corners only when the complete footprint fits along the shortcut.
        while (path.length > 1 && this.clear(start, path[1])) path.shift();
        return this.clear(start, path[0]) ? path : [];
      }
      closed[id] = 1;
      const a = this.point(id), col = id % this.columns, row = Math.floor(id / this.columns);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || col + dx < 0 || col + dx >= this.columns || row + dy < 0 || row + dy >= this.rows) continue;
        const next = id + dx + dy * this.columns;
        if (!this.free[next] || closed[next]) continue;
        const b = this.point(next), cost = costs[id] + Math.hypot(dx, dy);
        if (cost >= costs[next] || !this.clear(a, b)) continue;
        costs[next] = cost; parents[next] = id;
        push(next, cost + Math.hypot(b.x - this.point(to).x, b.y - this.point(to).y) / this.cell);
      }
    }
    return [];
  }

  /** Escape a physical contact before requiring the usual two-unit margin. */
  routeFromContact(start:WolfPoint,goal:WolfPoint):WolfPoint[] {
    if(this.canStand(start))return this.route(start,goal);
    // Arcade may leave a tiny rounding error at a touching edge, not a real overlap.
    if(!this.canStand(start,-.05))return [];
    for(const radius of [4,8,16,24,36,48]) {
      const candidates:WolfPoint[]=[];
      for(let n=0;n<16;n++) {
        const angle=n*Math.PI/8,q={x:start.x+Math.cos(angle)*radius,y:start.y+Math.sin(angle)*radius};
        if(this.canStand(q)&&this.clear(start,q,-.05))candidates.push(q);
      }
      candidates.sort((a,b)=>Math.hypot(a.x-goal.x,a.y-goal.y)-Math.hypot(b.x-goal.x,b.y-goal.y));
      for(const q of candidates){const path=this.route(q,goal);if(path.length)return [q,...path];}
    }
    return [];
  }

  private point(id: number): WolfPoint {
    return { x: (id % this.columns + .5) * this.cell, y: (Math.floor(id / this.columns) + .5) * this.cell };
  }

  private nearest(p: WolfPoint, requireConnection = true) {
    const col = Math.floor(p.x / this.cell), row = Math.floor(p.y / this.cell);
    for (let radius = 0; radius < 6; radius++) {
      let best = -1, distance = Infinity;
      for (let y = row - radius; y <= row + radius; y++) for (let x = col - radius; x <= col + radius; x++) {
        if (x < 0 || y < 0 || x >= this.columns || y >= this.rows) continue;
        const id = y * this.columns + x, q = this.point(id), d = Math.hypot(q.x - p.x, q.y - p.y);
        if (this.free[id] && d < distance && (!requireConnection || this.clear(p, q))) { best = id; distance = d; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
}
