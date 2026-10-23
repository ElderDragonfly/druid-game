import { WolfBehavior } from './WolfBehavior';
import { FOREST_INSECT } from '../data/forestInsect';
import type { InsectFlightSave } from '../persistence/snapshots';
import type { Rect } from '../world/meadowLayout';
import type { WolfNavigation, WolfPoint } from '../world/WolfNavigation';
import { seededRandom } from '../world/random';

/** Independent, uneven flight legs; ordinary combat still uses the true target. */
export class InsectFlight extends WolfBehavior {
  private flight:InsectFlightSave={randomIndex:0,legMs:0,pauseMs:0};
  private readonly seed:number;
  private launchPath:WolfPoint[]=[];
  private launchPathAge=Infinity;

  constructor(navigation:WolfNavigation,start:WolfPoint,identity:number) {
    super(navigation,start,identity,FOREST_INSECT);
    this.seed=navigation.layout.seed^0x464c4947^identity;
  }
  get launching(){return this.flight.launch!==undefined;}
  get launchDepth(){return this.flight.launchDepth??0;}
  launch(destination:WolfPoint,depth:number) {
    this.alert();this.flight.launch={...destination};this.flight.launchDepth=depth;
    this.flight.waypoint=undefined;this.launchPathAge=Infinity;
  }
  snapshotFlight():InsectFlightSave{return structuredClone(this.flight);}
  restoreFlight(saved?:InsectFlightSave) {
    this.flight=saved?structuredClone(saved):{randomIndex:0,legMs:0,pauseMs:0};
    this.launchPath=[];this.launchPathAge=Infinity;
  }
  override step(delta:number,position:WolfPoint,player:WolfPoint,playerBody:Rect):WolfPoint {
    const dt=Math.max(0,delta),s=this.actorState,f=this.flight;
    if(f.launch) {
      if(Math.hypot(f.launch.x-position.x,f.launch.y-position.y)<=12) {
        f.launch=undefined;f.launchDepth=undefined;f.legMs=0;
      } else {
        s.phase='chase';s.elapsed+=dt;s.target={...f.launch};this.launchPathAge+=dt;
        if(this.launchPathAge>=450||!this.launchPath.length) {
          this.launchPath=this.navigation.route(position,f.launch);this.launchPathAge=0;
        }
        while(this.launchPath.length&&Math.hypot(this.launchPath[0].x-position.x,this.launchPath[0].y-position.y)<6)this.launchPath.shift();
        const next=this.launchPath[0];if(!next)return {x:0,y:0};
        const dx=next.x-position.x,dy=next.y-position.y,d=Math.hypot(dx,dy);
        const speed=Math.min(s.runSpeed,d/Math.max(dt/1000,.001));
        return {x:dx/d*speed,y:dy/d*speed};
      }
    }
    // Attack and its recovery never aim at a detour waypoint.
    if(!s.alerted||s.phase==='attack'||this.inAttackRange(position,playerBody)) {
      f.pauseMs=0;f.legMs=0;return super.step(dt,position,player,playerBody);
    }
    if(f.pauseMs>0) {
      f.pauseMs=Math.max(0,f.pauseMs-dt);s.elapsed+=dt;return {x:0,y:0};
    }
    f.legMs=Math.max(0,f.legMs-dt);
    const distance=Math.hypot(player.x-position.x,player.y-position.y);
    if(!f.waypoint||f.legMs<=0||Math.hypot(f.waypoint.x-position.x,f.waypoint.y-position.y)<10) {
      const random=seededRandom(this.seed^++f.randomIndex);
      if(distance>140&&f.waypoint&&random()<.22) {
        f.pauseMs=200+random()*150;f.waypoint=undefined;return {x:0,y:0};
      }
      f.waypoint={...player};
      const forward=Math.min(distance,65+random()*90),dx=(player.x-position.x)/Math.max(1,distance),dy=(player.y-position.y)/Math.max(1,distance);
      // Unequal random offsets and lengths, rather than a periodic wave.
      for(let attempt=0;attempt<8&&distance>85;attempt++) {
        const sideways=(random()*2-1)*Math.min(100,distance*.3);
        const q={x:position.x+dx*forward-dy*sideways,y:position.y+dy*forward+dx*sideways};
        if(this.navigation.clear(position,q)){f.waypoint=q;break;}
      }
      f.legMs=550+random()*750;
    }
    return super.step(dt,position,f.waypoint,playerBody);
  }
}
