import type { BearState } from '../behavior/BearBehavior';
import type { BearAnimation } from '../rendering/bearArt';
import type { DruidState } from '../behavior/DruidMovement';
import type { WolfState } from '../behavior/WolfBehavior';
import type { MouseActorState } from '../behavior/MouseWander';
import type { Facing } from '../input/EightWayFacing';
import type { MeadowLayout } from '../world/meadowLayout';
import type { WolfAnimation } from '../rendering/wolfArt';
import type { InsectDirection, InsectAnimation } from '../rendering/forestInsectArt';
import type { CleansingStatus } from '../world/CleansingTree';
import type { SproutEncounterSave } from '../world/SproutEncounter';

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
export interface InsectFlightSave {
  launch?:PointSave;launchDepth?:number;launchStart?:PointSave;
  launchTravelled?:number;launchLength?:number;
  wavePhase:number;pauseMs:number;
}
export interface ForestInsectSave extends Omit<WolfSave,'animation'> { animation:InsectAnimation; facing:InsectDirection;flight?:InsectFlightSave;hitPush?:PointSave }
export interface CleansingSave {roomId:number;status:CleansingStatus;enemies:ForestInsectSave[];cleansingElapsed?:number}
export interface BearSave extends PointSave {state:BearState;animation:BearAnimation;clock:number;hitElapsed:number|null}
export interface BushRunnerSave {source:number;target:number;phase:'warning'|'moving';elapsed:number;distance:number;delayMs?:number}
export interface BushTrapsSave {wave:number;waitMs:number;runners:BushRunnerSave[]}
export interface WorldSave { wolves: WolfSave[]; mice: MouseSave[];sprouts?:SproutEncounterSave;skeletons?:WolfSave[];bear?:BearSave; stump?:{activated:boolean};cleansing?:CleansingSave;witchCircle?:{collected:boolean};bushTraps?:BushTrapsSave }
export interface ProjectileSave extends PointSave {
  direction: PointSave; range: number; distance: number; ageMs: number; nextLeafDistance: number;
}
export interface RunSave {
  version: 1; savedAt: number; characterId: string; layout: MeadowLayout;
  player: DruidSave; camera: PointSave; world: WorldSave; shots: ProjectileSave[];
}
