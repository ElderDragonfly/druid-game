import { FALLEN_LOGS, LOG_MUSHROOMS, FALLEN_LOG_GENERATION as CONFIG } from '../data/fallenLogs';
import { seededRandom } from './random';
import { overlaps, type Rect } from './geometry';
import type { MeadowLayout } from './meadowLayout';

export interface FallenLogPlacement {
  x: number; y: number; variant: number; angle: number; flipX: boolean;
  mushrooms: { variant: number; slot: number }[];
}
/** Native sprite orientation, including logs restored from older rotated saves. */
export function logPoint(log: FallenLogPlacement, x: number, y: number) {
  const art = FALLEN_LOGS[log.variant];
  return { x: log.x + (x - art.width / 2) * art.scale,
    y: log.y + (y - art.height / 2) * art.scale };
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
export function generateFallenLogs(layout: MeadowLayout, trunks: readonly Rect[], canopies: readonly Rect[]): FallenLogPlacement[] {
  const random = seededRandom(layout.seed ^ 0x4c4f4753);
  const integer = (min:number,max:number)=>min+Math.floor(random()*(max-min+1));
  const count = integer(CONFIG.min,CONFIG.max), result:FallenLogPlacement[]=[];
  const spawn = {x:layout.spawn.x-80,y:layout.spawn.y-80,width:160,height:160};
  for(let index=0;index<count;index++) {
    const variant=integer(0,FALLEN_LOGS.length-1), angle=0, flipX=false;
    const mushrooms:FallenLogPlacement['mushrooms']=[];
    if(random()<CONFIG.mushroomChance) {
      const species=integer(0,LOG_MUSHROOMS.length-1), amount=integer(CONFIG.mushroomMin,CONFIG.mushroomMax);
      const slots=[0,1,2];
      for(let n=0;n<amount;n++) mushrooms.push({variant:species,slot:slots.splice(integer(0,slots.length-1),1)[0]});
    }
    let placed=false;
    for(let attempt=0;attempt<2000;attempt++) {
      const log={x:160+random()*(layout.width-320),y:160+random()*(layout.height-320),variant,angle,flipX,mushrooms};
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
