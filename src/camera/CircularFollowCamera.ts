/** A fixed world-space circle: motion inside it does not move the camera. */
export class CircularFollowCamera {
  readonly center: { x: number; y: number };
  private viewWidth = 0;
  private viewHeight = 0;

  constructor(
    private readonly worldWidth: number,
    private readonly worldHeight: number,
    readonly radius: number,
    private readonly responseMs: number,
  ) {
    this.center = { x: worldWidth / 2, y: worldHeight / 2 };
  }

  resize(viewWidth: number, viewHeight: number) {
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;
    this.clampToWorld();
  }

  update(x: number, y: number, deltaMs: number) {
    const dx = x - this.center.x;
    const dy = y - this.center.y;
    const distance = Math.hypot(dx, dy);
    if (distance > this.radius) {
      const excess = distance - this.radius;
      // Exponential smoothing has the same response at different frame rates.
      // Settle at the circle edge, never recenter on the stopped character.
      const amount = excess < 0.01 ? excess : excess * (1 - Math.exp(-Math.min(deltaMs, 100) / this.responseMs));
      this.center.x += dx / distance * amount;
      this.center.y += dy / distance * amount;
    }
    this.clampToWorld();
    return this.center;
  }

  private clampToWorld() {
    const halfWidth = Math.min(this.viewWidth, this.worldWidth) / 2;
    const halfHeight = Math.min(this.viewHeight, this.worldHeight) / 2;
    this.center.x = Math.max(halfWidth, Math.min(this.worldWidth - halfWidth, this.center.x));
    this.center.y = Math.max(halfHeight, Math.min(this.worldHeight - halfHeight, this.center.y));
  }
}
