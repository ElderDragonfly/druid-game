import { CHARACTERS } from '../data/characters';
import { ENVIRONMENT_VARIANTS } from '../data/environment';
import { FACINGS } from '../input/EightWayFacing';
import { MEADOW_WORLD } from '../world/meadowLayout';
import type { PointSave, RunSave } from './snapshots';

export const RUN_SAVE_KEY = 'druid-game.run.v1';
let sessionSave: RunSave | null = null;
let sessionOnly = false;
const nonnegative = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1e9;
const flag = (value: unknown) => typeof value === 'boolean';
const point = (p: PointSave) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
  p.x >= 0 && p.x <= MEADOW_WORLD.width && p.y >= -32 && p.y <= MEADOW_WORLD.height + 32;
const facing = (value: RunSave['player']['state']['facing']) => FACINGS.includes(value);

/** Treat local storage as untrusted input; old/truncated saves cannot crash boot. */
export function isRunSave(value: unknown): value is RunSave {
  try {
    const s = value as RunSave;
    if (!s || s.version !== 1 || !Number.isFinite(s.savedAt) ||
      !CHARACTERS.some(c => c.id === s.characterId && c.available) ||
      !s.layout || s.layout.width !== MEADOW_WORLD.width || s.layout.height !== MEADOW_WORLD.height ||
      !Number.isInteger(s.layout.seed) || s.layout.seed < 0 || s.layout.seed > 0xffffffff ||
      !point(s.layout.spawn) || !point(s.camera) || !Array.isArray(s.layout.obstacles) ||
      s.layout.obstacles.length > 4096 || s.layout.counts?.trees !== s.layout.obstacles.length) return false;
    if (!s.layout.obstacles.every(o => o.kind === 'tree' && point(o) && Number.isInteger(o.variant) &&
      !!ENVIRONMENT_VARIANTS.tree[o.variant])) return false;
    const p = s.player, state = p?.state;
    if (!point(p) || !state || !Number.isInteger(state.health) || state.health < 1 || state.health > state.maxHealth ||
      !Number.isInteger(state.maxHealth) || state.maxHealth > 10000 || !nonnegative(state.speed) ||
      !nonnegative(state.attackRate) || !nonnegative(state.range) || !facing(state.facing) ||
      !flag(p.cast?.active) || !facing(p.cast.facing) || !nonnegative(p.cast.elapsed) || !flag(p.cast.released) ||
      (p.cast.pendingRelease !== undefined && !facing(p.cast.pendingRelease)) ||
      !flag(p.hit?.active) || !facing(p.hit.facing) || !nonnegative(p.hit.elapsed)) return false;
    if (!Array.isArray(s.world?.wolves) || s.world.wolves.length > 128 ||
      !s.world.wolves.every(w => point(w) && !!w.state && Number.isInteger(w.state.health) &&
        Number.isInteger(w.state.maxHealth) && w.state.maxHealth > 0 && w.state.maxHealth <= 10000 &&
        w.state.health >= 0 && w.state.health <= w.state.maxHealth &&
        ['idle', 'wander', 'chase', 'attack'].includes(w.state.phase) && flag(w.state.alerted) &&
        nonnegative(w.state.elapsed) && nonnegative(w.state.walkSpeed) && nonnegative(w.state.runSpeed) &&
        point(w.state.target) && flag(w.state.facingLeft) && flag(w.state.attackUp) &&
        !!w.timers && [w.timers.idleMs, w.timers.wanderMs, w.timers.recoveryMs].every(nonnegative) &&
        ['idle', 'walk', 'run', 'attack-up', 'attack-down', 'death'].includes(w.animation) &&
        nonnegative(w.clock) && (w.hitElapsed === null || nonnegative(w.hitElapsed)) &&
        nonnegative(w.deathElapsed) && flag(w.attackConnected) && flag(w.corpse) &&
        (!w.corpse || w.state.health === 0))) return false;
    if (!Array.isArray(s.world.mice) || s.world.mice.length > 32 ||
      !s.world.mice.every(m => point(m) && !!m.state && ['run', 'rise', 'look', 'lower'].includes(m.state.phase) &&
        nonnegative(m.state.elapsed) && nonnegative(m.state.speed) && point(m.state.target) &&
        nonnegative(m.runLimit) && Number.isInteger(m.frameIndex) && m.frameIndex >= 0 && m.frameIndex < 128 && flag(m.flipX))) return false;
    return Array.isArray(s.shots) && s.shots.length <= 8 && s.shots.every(a => point(a) && !!a.direction &&
      Number.isFinite(a.direction.x) && Number.isFinite(a.direction.y) &&
      Math.abs(Math.hypot(a.direction.x, a.direction.y) - 1) < .0001 &&
      [a.range, a.distance, a.ageMs, a.nextLeafDistance].every(nonnegative));
  } catch { return false; }
}

export function loadRun(): RunSave | null {
  if (sessionOnly) return sessionSave;
  let raw: string | null;
  try { raw = localStorage.getItem(RUN_SAVE_KEY); } catch { return sessionSave; }
  if (!raw || raw.length > 1_000_000) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRunSave(parsed) ? parsed : null;
  } catch { return null; }
}

/** If browser storage is unavailable, Continue still works in this open tab. */
export function saveRun(snapshot: RunSave) {
  const json = JSON.stringify(snapshot);
  sessionSave = JSON.parse(json) as RunSave;
  try { localStorage.setItem(RUN_SAVE_KEY, json); sessionOnly = false; return true; }
  catch { sessionOnly = true; return false; }
}

export function clearRun() {
  sessionSave = null;
  try { localStorage.removeItem(RUN_SAVE_KEY); sessionOnly = false; }
  catch { sessionOnly = true; }
}
