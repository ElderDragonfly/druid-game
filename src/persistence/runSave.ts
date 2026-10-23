import { stumpVisualRect } from '../world/stump';
import { CHARACTERS } from '../data/characters';
import { ENVIRONMENT_VARIANTS } from '../data/environment';
import { FACINGS } from '../input/EightWayFacing';
import { MEADOW_WORLD } from '../world/meadowLayout';
import { FALLEN_LOGS, ACTIVE_LOG_VARIANTS, LOG_MUSHROOMS, FALLEN_LOG_GENERATION } from '../data/fallenLogs';
import { onMushroomSurface, logVisualRect, scatterLogMushrooms } from '../world/fallenLogs';
import { seededRandom } from '../world/random';
import type { PointSave, RunSave } from './snapshots';
import { ROOM_ASSIGNMENTS, ROOM_SCENARIOS } from '../data/roomScenarios';
import { roomAt, roomBounds } from '../world/rooms';
import insectArt from '../../docs/art/forest-insect-v1/animations.json';

export const RUN_SAVE_KEY = 'druid-game.run.v1';
let sessionSave: RunSave | null = null;
let sessionOnly = false;
const nonnegative = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1e9;
const flag = (value: unknown) => typeof value === 'boolean';
const point = (p: PointSave) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
  p.x >= 0 && p.x <= MEADOW_WORLD.width && p.y >= -32 && p.y <= MEADOW_WORLD.height + 32;
const facing = (value: RunSave['player']['state']['facing']) => FACINGS.includes(value);
// Old runs referenced seven retired mushroom sprites. Accept only those known
// indices, then replace their artwork on load without losing collected items.
const LEGACY_MUSHROOM_COUNT = 7;
function migrateMushrooms(save: RunSave): RunSave {
  save.layout.logs?.forEach(log => {
    // Keep old runs, collected items and log positions; limit legacy rotation.
    const tilt=FALLEN_LOG_GENERATION.maxTiltDegrees;
    log.angle=Math.max(-tilt,Math.min(tilt,log.angle));
    log.mushrooms.forEach(mushroom => { mushroom.variant %= LOG_MUSHROOMS.length; });
    if(log.variant !== ACTIVE_LOG_VARIANTS[0]) {
      log.variant=ACTIVE_LOG_VARIANTS[0];
      log.angle=0; log.flipX=false;
      scatterLogMushrooms(log.variant,log.mushrooms,
        seededRandom(save.layout.seed ^ Math.round(log.x*31+log.y*17)));
    }
  });
  return save;
}

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
    if(s.layout.rooms!==undefined) {
      if(!Array.isArray(s.layout.rooms)||s.layout.rooms.length!==9||!s.layout.rooms.every((room,index)=>{
        if(room.id!==index||room.scenario!==ROOM_ASSIGNMENTS[index])return false;
        if(room.scenario!=='cleansing-tree')return room.tree===undefined;
        if(!room.tree||!point(room.tree)||roomAt(s.layout,room.tree)!==index)return false;
        const r=roomBounds(s.layout,index);
        return room.tree.x-100>=r.x&&room.tree.x+100<=r.x+r.width&&room.tree.y-248>=r.y&&room.tree.y+2<=r.y+r.height;
      }))return false;
    }
    if (s.layout.logs !== undefined) {
      const logs = s.layout.logs;
      if (!Array.isArray(logs) || logs.length < (s.layout.rooms?1:2) || logs.length > (s.layout.rooms?2:4) || s.layout.counts.logs !== logs.length ||
        !logs.every(log => {
          if (!point(log) || !Number.isInteger(log.variant) || !FALLEN_LOGS[log.variant] ||
            !Number.isFinite(log.angle) || Math.abs(log.angle) > 180 || !flag(log.flipX) ||
            !Array.isArray(log.mushrooms) || log.mushrooms.length > 3) return false;
          const bounds = logVisualRect(log);
          return bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= s.layout.width &&
            bounds.y + bounds.height <= s.layout.height &&
            new Set(log.mushrooms.map(m => m.slot)).size === log.mushrooms.length &&
            new Set(log.mushrooms.map(m => m.variant)).size <= 1 &&
            log.mushrooms.every(m => !!m && Number.isInteger(m.variant) && m.variant >= 0 &&
              m.variant < Math.max(LOG_MUSHROOMS.length, LEGACY_MUSHROOM_COUNT) &&
              Number.isInteger(m.slot) && m.slot >= 0 && m.slot < FALLEN_LOGS[log.variant].mushroomSpots.length &&
              (m.surface === undefined || (Number.isFinite(m.surface.x) && Number.isFinite(m.surface.y) &&
                onMushroomSurface(log.variant,m.surface))));
        })) return false;
    } else if (s.layout.counts.logs !== undefined) return false;
    if(s.layout.stump!==undefined) {
      if(!point(s.layout.stump))return false;
      const bounds=stumpVisualRect(s.layout.stump);
      if(bounds.x<0||bounds.y<0||bounds.x+bounds.width>s.layout.width||bounds.y+bounds.height>s.layout.height)return false;
    }
    if(s.world?.stump!==undefined&&(!s.layout.stump||!flag(s.world.stump.activated)))return false;
    if(s.layout.rooms) {
      if(s.layout.logs!.some(log=>roomAt(s.layout,log)!==8)||
        s.layout.logs!.reduce((n,log)=>n+log.mushrooms.length,0)>ROOM_SCENARIOS.wolves.mushrooms.max)return false;
      if(!s.world?.cleansing)return false;
    }
    const p = s.player, state = p?.state;
    if (!point(p) || !state || !Number.isInteger(state.health) || state.health < 1 || state.health > state.maxHealth ||
      !Number.isInteger(state.maxHealth) || state.maxHealth > 10000 || !nonnegative(state.speed) ||
      !nonnegative(state.attackRate) || !nonnegative(state.range) || !facing(state.facing) ||
      !flag(p.cast?.active) || !facing(p.cast.facing) || !nonnegative(p.cast.elapsed) || !flag(p.cast.released) ||
      (p.cast.pendingRelease !== undefined && !facing(p.cast.pendingRelease)) ||
      !flag(p.hit?.active) || !facing(p.hit.facing) || !nonnegative(p.hit.elapsed)) return false;
    const validCreature=(w:RunSave['world']['wolves'][number],animations:readonly string[])=>point(w) && !!w.state && Number.isInteger(w.state.health) &&
        Number.isInteger(w.state.maxHealth) && w.state.maxHealth > 0 && w.state.maxHealth <= 10000 &&
        w.state.health >= 0 && w.state.health <= w.state.maxHealth &&
        ['idle', 'wander', 'chase', 'attack'].includes(w.state.phase) && flag(w.state.alerted) &&
        nonnegative(w.state.elapsed) && nonnegative(w.state.walkSpeed) && nonnegative(w.state.runSpeed) &&
        point(w.state.target) && flag(w.state.facingLeft) && flag(w.state.attackUp) &&
        !!w.timers && [w.timers.idleMs, w.timers.wanderMs, w.timers.recoveryMs].every(nonnegative) &&
        animations.includes(w.animation) &&
        nonnegative(w.clock) && (w.hitElapsed === null || nonnegative(w.hitElapsed)) &&
        nonnegative(w.deathElapsed) && flag(w.attackConnected) && flag(w.corpse) &&
        (!w.corpse || w.state.health === 0);
    if (!Array.isArray(s.world?.wolves) || s.world.wolves.length > 128 ||
      !s.world.wolves.every(w=>validCreature(w,['idle','walk','run','attack-up','attack-down','death'])))return false;
    if(s.world.cleansing!==undefined) {
      const c=s.world.cleansing;
      if(!s.layout.rooms?.some(room=>room.id===c.roomId&&room.scenario==='cleansing-tree')||
        !['dormant','active','cleansed'].includes(c.status)||!Array.isArray(c.enemies)||
        c.enemies.length!==(c.status==='dormant'?0:ROOM_SCENARIOS.cleansing.enemyCount)||
        !c.enemies.every(enemy=>(enemy.flight===undefined||(!!enemy.flight&&
          Number.isInteger(enemy.flight.randomIndex)&&nonnegative(enemy.flight.randomIndex)&&
          nonnegative(enemy.flight.legMs)&&nonnegative(enemy.flight.pauseMs)&&
          (enemy.flight.launch===undefined||point(enemy.flight.launch))&&
          (enemy.flight.launchDepth===undefined||nonnegative(enemy.flight.launchDepth))&&
          (enemy.flight.waypoint===undefined||point(enemy.flight.waypoint))))&&
          ['up','down','left','right'].includes(enemy.facing)&&
          validCreature(enemy as unknown as RunSave['world']['wolves'][number],Object.keys(insectArt.animations)))||
        c.status==='cleansed'&&!c.enemies.every(enemy=>enemy.corpse))return false;
    }
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
  if (sessionOnly) return sessionSave ? migrateMushrooms(sessionSave) : null;
  let raw: string | null;
  try { raw = localStorage.getItem(RUN_SAVE_KEY); } catch { return sessionSave ? migrateMushrooms(sessionSave) : null; }
  if (!raw || raw.length > 1_000_000) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRunSave(parsed) ? migrateMushrooms(parsed) : null;
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
