import { FALLEN_LOGS, ACTIVE_LOG_VARIANTS, LOG_MUSHROOMS, FALLEN_LOG_GENERATION as CONFIG } from '../data/fallenLogs';
import { seededRandom } from './random';
import { overlaps, type Rect } from './geometry';
import type { MeadowLayout } from './meadowLayout';
import { ROOM_SCENARIOS } from '../data/roomScenarios';
import { roomBounds } from './rooms';

export interface LogMushroom {
  variant: number; slot: number;
  /** Native sprite coordinates. Older saves fall back to their original slot. */
  surface?: { x: number; y: number };
}

export interface FallenLogPlacement {
  x: number; y: number; variant: number; angle: number; flipX: boolean;
  mushrooms: LogMushroom[];
}
/** Rotate all native wood/mushroom anchors around the sprite centre. */
export function logPoint(log: FallenLogPlacement, x: number, y: number) {
  const art = FALLEN_LOGS[log.variant];
  const angle=log.angle*Math.PI/180, dx=(x-art.width/2)*art.scale, dy=(y-art.height/2)*art.scale;
  return { x:log.x+dx*Math.cos(angle)-dy*Math.sin(angle),
    y:log.y+dx*Math.sin(angle)+dy*Math.cos(angle) };
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

/** Scatter the existing items on a wood surface, preserving species/slot IDs.
 * Shared by new layouts and migration from retired brown logs. */
export function scatterLogMushrooms(variant: number, mushrooms: LogMushroom[], random: () => number) {
  const art=FALLEN_LOGS[variant];
  const integer=(min:number,max:number)=>min+Math.floor(random()*(max-min+1));
  const placed: { x:number; y:number }[]=[];
  for(const mushroom of mushrooms) {
    let surface: { x:number; y:number } | undefined;
    for(let attempt=0;attempt<1000;attempt++) {
      const p={x:integer(1,art.width-2),y:integer(1,art.height-2)};
      if(onMushroomSurface(variant,p)&&placed.every(other=>
        Math.hypot(other.x-p.x,other.y-p.y)>=6&&Math.abs(other.x-p.x)>=4)&&
        (placed.length<2||Math.abs((placed[1].x-placed[0].x)*(p.y-placed[0].y)-
          (placed[1].y-placed[0].y)*(p.x-placed[0].x))>=6)) {surface=p;break;}
    }
    if(!surface)throw new Error('Не удалось разместить грибы на древесине');
    mushroom.surface=surface;
    placed.push(surface);
  }
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
  const room=layout.rooms?.find(room=>room.scenario==='wolves');
  if(layout.rooms&&!room)return [];
  const scenario=ROOM_SCENARIOS.wolves;
  const count = room ? integer(scenario.logs.min,scenario.logs.max) : integer(CONFIG.min,CONFIG.max);
  const bounds=room ? roomBounds(layout,room.id) : {x:0,y:0,width:layout.width,height:layout.height};
  // A total for the room, distributed among its logs; not a quota per log.
  const amounts=Array.from({length:count},()=>0);
  if(room) {
    const total=integer(scenario.mushrooms.min,scenario.mushrooms.max);
    for(let n=0;n<total;n++)amounts[integer(0,count-1)]++;
  }
  const result:FallenLogPlacement[]=[];
  const spawn = {x:layout.spawn.x-80,y:layout.spawn.y-80,width:160,height:160};
  for(let index=0;index<count;index++) {
    const variant=ACTIVE_LOG_VARIANTS[integer(0,ACTIVE_LOG_VARIANTS.length-1)];
    const angle=(random()*2-1)*CONFIG.maxTiltDegrees, flipX=false;
    const mushrooms:FallenLogPlacement['mushrooms']=[];
    const amount=room ? amounts[index] : random()<CONFIG.mushroomChance ? integer(CONFIG.mushroomMin,CONFIG.mushroomMax) : 0;
    if(amount) {
      const species=integer(0,LOG_MUSHROOMS.length-1);
      for(let n=0;n<amount;n++) mushrooms.push({variant:species,slot:n});
      scatterLogMushrooms(variant,mushrooms,random);
    }
    let placed=false;
    for(let attempt=0;attempt<2000;attempt++) {
      const x=bounds.x+160+random()*(bounds.width-320);
      const y=bounds.y+160+random()*(bounds.height-320);
      const log={x,y,variant,angle,flipX,mushrooms};
      const visual=logVisualRect(log), bodies=logCollisionRects(log);
      if(visual.x<24||visual.y<24||visual.x+visual.width>layout.width-24||visual.y+visual.height>layout.height-24||overlaps(visual,spawn))continue;
      if(room&&(visual.x<bounds.x+24||visual.y<bounds.y+24||visual.x+visual.width>bounds.x+bounds.width-24||visual.y+visual.height>bounds.y+bounds.height-24))continue;
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
