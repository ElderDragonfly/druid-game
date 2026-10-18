/** Projectiles deliver damage through this interface, independently of enemy AI. */
export interface Damageable { takeDamage(amount: number): boolean }

export function isDamageable(target: unknown): target is Damageable {
  return !!target && typeof (target as Damageable).takeDamage === 'function';
}
