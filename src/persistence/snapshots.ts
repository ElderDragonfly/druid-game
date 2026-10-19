import type { DruidState } from '../behavior/DruidMovement';
import type { WolfState } from '../behavior/WolfBehavior';
import type { MouseActorState } from '../behavior/MouseWander';
import type { Facing } from '../input/EightWayFacing';
import type { MeadowLayout } from '../world/meadowLayout';
import type { WolfAnimation } from '../rendering/wolfArt';

export interface PointSave { x: number; y: number }
export interface CastSave { active: boolean; facing: Facing; elapsed: number; released: boolean; pendingRelease?: Facing }
export interface HitSave { active: boolean; facing: Facing; elapsed: number }
export interface DruidSave extends PointSave { state: DruidState; cast: CastSave; hit: HitSave }
export interface WolfTimers { idleMs: number; wanderMs: number; recoveryMs: number }
export interface WolfSave extends PointSave {
  state: WolfState; timers: WolfTimers; animation: WolfAnimation; clock: number;
  hitElapsed: number | null; deathElapsed: number; attackConnected: boolean; corpse: boolean;
}
export interface MouseSave extends PointSave {
  state: MouseActorState; runLimit: number; frameIndex: number; flipX: boolean;
}
export interface WorldSave { wolves: WolfSave[]; mice: MouseSave[] }
export interface ProjectileSave extends PointSave {
  direction: PointSave; range: number; distance: number; ageMs: number; nextLeafDistance: number;
}
export interface RunSave {
  version: 1; savedAt: number; characterId: string; layout: MeadowLayout;
  player: DruidSave; camera: PointSave; world: WorldSave; shots: ProjectileSave[];
}
