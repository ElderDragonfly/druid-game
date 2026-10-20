import { FALLEN_LOGS, LOG_MUSHROOMS, FALLEN_LOG_GENERATION as CONFIG } from '../data/fallenLogs';
import { seededRandom } from './random';
import { overlaps, type Rect } from './geometry';
import type { MeadowLayout } from './meadowLayout';

export interface LogMushroom {
  variant: number; slot: number;
  /** Native sprite coordinates. Older saves fall back to their original slot. */
  surface?: { x: number; y: number };
}

export interface FallenLogPlacement {
  x: number; y: number; variant: number; angle: number; flipX: boolean;
  mushrooms: LogMushroom[];
}
/** Native sprite orientation, including logs restored from older rotated saves. */
export function logPoint(log: FallenLogPlacement, x: number, y: number) {
  const art = FALLEN_LOGS[log.variant];
  return { x: log.x + (x - art.width / 2) * art.scale,
    y: log.y + (y - art.height / 2) * art.scale };
}
export function mushroomPoint(log: FallenLogPlacement, mushroom: LogMushroom) {
  const fallback = FALLEN_LOGS[log.variant].mushroomSpots[mushroom.slot];
  return logPoint(log, mushroom.surface?.x ?? fallback[0], mushroom.surface?.y ?? fallback[1]);
}

/** A narrow polygon on the visible wood, rather than a row of fixed sockets. */
export function onMushroomSurface(variant: number, point: { x: number; y: number }) {
  const polygon = FALLEN_LOGS[variant].mushroomSurface;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[i], [bx, by] = polygon[j];
    if ((ay > point.y) !== (by > point.y) &&
      point.x < (bx - ax) * (point.y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/** Reserve just four small clearings for the temporary start-screen test. */
export function logTestAreas(spawn: { x: number; y: number }): Rect[] {
  return CONFIG.testAroundSpawn ? CONFIG.testOffsets.map(offset => ({
    x: spawn.x + offset.x - 88, y: spawn.y + offset.y - 62, width: 176, height: 124,
  })) : [];
}

export function logVisualRect(log: FallenLogPlacement): Rect {
  const a = FALLEN_LOGS[log.variant];
  const points = [[0,0],[a.width,0],[a.width,a.height],[0,a.height]].map(([x,y])=>logPoint(log,x,y));
  const left=Math.min(...points.map(p=>p.x)), top=Math.min(...points.map(p=>p.y));
  return { x:left,y:top,width:Math.max(...points.map(p=>p.x))-left,height:Math.max(...points.map(p=>p.y))-top };
}
/** Small overlapping footprints follow the wood, leaving the empty corners of
 * the sprite walkable. Physics, navigation and placement share them. */
export function logCollisionRects(log: FallenLogPlacement): Rect[] {
  const art = FALLEN_LOGS[log.variant], [start,end] = art.bodyLine;
  const a = logPoint(log,start[0],start[1]), b = logPoint(log,end[0],end[1]), radius = art.bodyRadius;
  const steps = Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/radius);
  return Array.from({length:steps+1},(_,index)=>({
    x:a.x+(b.x-a.x)*index/steps-radius,y:a.y+(b.y-a.y)*index/steps-radius,
    width:radius*2,height:radius*2,
  }));
}
/** Distance to the wood as a whole, independent of where its mushrooms grow. */
export function distanceToLog(log: FallenLogPlacement, point: { x: number; y: number }) {
  return Math.min(...logCollisionRects(log).map(rect => Math.hypot(
    Math.max(rect.x-point.x,0,point.x-rect.x-rect.width),
    Math.max(rect.y-point.y,0,point.y-rect.y-rect.height),
  )));
}

export function generateFallenLogs(layout: MeadowLayout, trunks: readonly Rect[], canopies: readonly Rect[]): FallenLogPlacement[] {
  const random = seededRandom(layout.seed ^ 0x4c4f4753);
  const integer = (min:number,max:number)=>min+Math.floor(random()*(max-min+1));
  const count = CONFIG.testAroundSpawn ? CONFIG.testOffsets.length : integer(CONFIG.min,CONFIG.max);
  const result:FallenLogPlacement[]=[], variants=FALLEN_LOGS.map((_, index)=>index);
  const spawn = {x:layout.spawn.x-80,y:layout.spawn.y-80,width:160,height:160};
  for(let index=0;index<count;index++) {
    const variant=CONFIG.testAroundSpawn ? variants.splice(integer(0,variants.length-1),1)[0] : integer(0,FALLEN_LOGS.length-1);
    const angle=0, flipX=false;
    const mushrooms:FallenLogPlacement['mushrooms']=[];
    if(random()<CONFIG.mushroomChance || (CONFIG.testAroundSpawn && index===0)) {
      const species=integer(0,LOG_MUSHROOMS.length-1), amount=integer(CONFIG.mushroomMin,CONFIG.mushroomMax);
      const art=FALLEN_LOGS[variant];
      for(let n=0;n<amount;n++) {
        let surface: { x: number; y: number } | undefined;
        for(let attempt=0;attempt<1000;attempt++) {
          const candidate={x:integer(1,art.width-2),y:integer(1,art.height-2)};
          if(onMushroomSurface(variant,candidate)&&mushrooms.every(m=>
            Math.hypot(m.surface!.x-candidate.x,m.surface!.y-candidate.y)>=6&&
            Math.abs(m.surface!.x-candidate.x)>=4) &&
            (mushrooms.length<2||Math.abs(
              (mushrooms[1].surface!.x-mushrooms[0].surface!.x)*(candidate.y-mushrooms[0].surface!.y)-
              (mushrooms[1].surface!.y-mushrooms[0].surface!.y)*(candidate.x-mushrooms[0].surface!.x))>=6)) {surface=candidate;break;}
        }
        if(!surface)throw new Error('Не удалось разместить грибы на древесине');
        mushrooms.push({variant:species,slot:n,surface});
      }
    }
    let placed=false;
    for(let attempt=0;attempt<2000;attempt++) {
      const offset=CONFIG.testOffsets[index];
      const x=CONFIG.testAroundSpawn ? layout.spawn.x+offset.x+integer(-12,12) : 160+random()*(layout.width-320);
      const y=CONFIG.testAroundSpawn ? layout.spawn.y+offset.y+integer(-10,10) : 160+random()*(layout.height-320);
      const log={x,y,variant,angle,flipX,mushrooms};
      const visual=logVisualRect(log), bodies=logCollisionRects(log);
      if(visual.x<24||visual.y<24||visual.x+visual.width>layout.width-24||visual.y+visual.height>layout.height-24||overlaps(visual,spawn))continue;
      // A handful of logs should be readable, rather than entirely hidden by
      // foreground canopies. Padding leaves room for the upright mushroom caps.
      if(canopies.some(rect=>overlaps(visual,rect,24)))continue;
      if(trunks.some(rect=>bodies.some(body=>overlaps(body,rect,28)))||
        result.some(other=>overlaps(visual,logVisualRect(other),24)))continue;
      result.push(log);placed=true;break;
    }
    if(!placed)throw new Error(`Не удалось разместить ${count} брёвен на локации`);
  }
  return result;
}
