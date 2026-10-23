export const DEFAULT_HOLD_DURATION_MS = 1000;

/** A stable target object; each action may override the common hold time. */
export interface HoldInteractionTarget {
  readonly holdDurationMs?: number;
  completeInteraction(): void;
}

/** Shared held-key action, independent of any particular world object or UI. */
export class HoldInteraction {
  private target?: HoldInteractionTarget;
  private elapsedMs = 0;
  private completed = false;
  get visible() { return !!this.target && !this.completed; }
  get progress() {
    return this.target ? this.elapsedMs / (this.target.holdDurationMs ?? DEFAULT_HOLD_DURATION_MS) : 0;
  }

  update(delta: number, target: HoldInteractionTarget | undefined, holding: boolean) {
    if (target !== this.target) { this.reset(); this.target = target; }
    if (!this.target) return;
    if (!holding) { this.elapsedMs = 0; this.completed = false; return; }
    if (this.completed) return;
    const duration = this.target.holdDurationMs ?? DEFAULT_HOLD_DURATION_MS;
    this.elapsedMs = Math.min(duration, this.elapsedMs + Math.min(100, Math.max(0, delta)));
    if (this.elapsedMs >= duration) {
      this.completed = true;
      this.target.completeInteraction();
    }
  }

  reset() { this.target = undefined; this.elapsedMs = 0; this.completed = false; }
}
