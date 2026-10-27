import { WolfBehavior } from './WolfBehavior';
import { FOREST_INSECT as CONFIG } from '../data/forestInsect';
import type { InsectFlightSave } from '../persistence/snapshots';
import type { Rect } from '../world/meadowLayout';
import { EnemyNavigator } from '../world/EnemyNavigator';
import type { WolfNavigation, WolfPoint } from '../world/WolfNavigation';

const TAU=Math.PI*2;
/** Physical routing on the ground, a separate launch arc, then sine-wave pursuit. */
export class InsectFlight extends WolfBehavior {
  private flight:InsectFlightSave={wavePhase:0,pauseMs:0};
  private previous?:WolfPoint;
  readonly navigator:EnemyNavigator;

  constructor(navigation:WolfNavigation,start:WolfPoint,identity:number) {
    super(navigation,start,identity,CONFIG);
    this.navigator=new EnemyNavigator(navigation,CONFIG.body);
    this.flight.wavePhase=(identity-1)*TAU/3;
  }
  get launching(){return this.flight.launch!==undefined;}
  get launchDepth(){return this.flight.launchDepth??0;}
  get altitude(){
    if(!this.launching)return 0;
    const t=Math.min(1,(this.flight.launchTravelled??0)/Math.max(1,this.flight.launchLength??1));
    return CONFIG.flight.launchHeight*4*t*(1-t);
  }
  launch(destination:WolfPoint,depth:number) {
    const start={...this.actorState.target};this.alert();
    const length=Math.hypot(destination.x-start.x,destination.y-start.y);
    Object.assign(this.flight,{launch:{...destination},launchStart:start,launchDepth:depth,launchTravelled:0,launchLength:Math.max(1,length)});
    this.previous=start;this.navigator.invalidate();
  }
  snapshotFlight():InsectFlightSave{return structuredClone(this.flight);}
  restoreFlight(saved?:InsectFlightSave) {
    // Earlier runs used random detours. Keep their launch, start the new wave.
    this.flight={...saved,wavePhase:saved?.wavePhase??0,pauseMs:Math.min(CONFIG.flight.peakPauseMs,saved?.pauseMs??0)};
    this.previous=undefined;this.navigator.invalidate();
  }
  override step(delta:number,position:WolfPoint,player:WolfPoint,playerBody:Rect):WolfPoint {
    const dt=Math.max(0,delta),s=this.actorState,f=this.flight;
    const travelled=this.previous?Math.hypot(position.x-this.previous.x,position.y-this.previous.y):0;
    this.previous={...position};
    if(f.launch) {
      f.launchStart??={...position};
      f.launchLength??=Math.max(1,Math.hypot(f.launch.x-position.x,f.launch.y-position.y));
      f.launchTravelled=Math.min(f.launchLength,(f.launchTravelled??0)+travelled);
      if(Math.hypot(f.launch.x-position.x,f.launch.y-position.y)<=6) {
        delete f.launch;delete f.launchDepth;delete f.launchStart;delete f.launchLength;delete f.launchTravelled;
      } else {
        s.phase='chase';s.elapsed+=dt;s.target={...f.launch};
        const dx=f.launch.x-position.x,dy=f.launch.y-position.y,distance=Math.hypot(dx,dy);
        const speed=Math.min(s.runSpeed,distance/Math.max(dt/1000,.001));
        return {x:dx/distance*speed,y:dy/distance*speed};
      }
    }
    if(!s.alerted||s.phase==='attack'||this.inAttackRange(position,playerBody)) {
      f.pauseMs=0;return super.step(dt,position,player,playerBody);
    }
    const open=this.navigation.clear(position,player)&&this.navigation.canStand(position,22)&&!this.navigator.nearPeer(position);
    if(!open){f.pauseMs=0;return super.step(dt,position,player,playerBody);}
    if(f.pauseMs>0) {
      f.pauseMs=Math.max(0,f.pauseMs-dt);s.elapsed+=dt;return {x:0,y:0};
    }
    const distance=Math.hypot(player.x-position.x,player.y-position.y);
    const amplitude=CONFIG.flight.waveAmplitude*Math.min(1,distance/120),k=TAU/CONFIG.flight.waveLength;
    const slope=amplitude*k*Math.cos(f.wavePhase);
    const advance=travelled*k/Math.sqrt(1+slope*slope);
    const nextPeak=Math.PI/2+Math.ceil((f.wavePhase-Math.PI/2+1e-7)/Math.PI)*Math.PI;
    if(f.wavePhase+advance>=nextPeak) {
      f.wavePhase=nextPeak%TAU;f.pauseMs=CONFIG.flight.peakPauseMs;s.elapsed+=dt;return {x:0,y:0};
    }
    f.wavePhase=(f.wavePhase+advance)%TAU;
    const base=super.step(dt,position,player,playerBody),speed=Math.hypot(base.x,base.y);
    if(!speed||this.navigator.detouring)return base;
    const side=amplitude*k*Math.cos(f.wavePhase),factor=1/Math.sqrt(1+side*side);
    const velocity={x:(base.x-base.y*side)*factor,y:(base.y+base.x*side)*factor};
    return this.navigator.waveVelocity(position,velocity,base);
  }
  /** A hit interrupts the sting; the next route starts at the pushed position. */
  reactToHit() {
    this.actorState.phase='chase';this.actorState.elapsed=0;this.flight.pauseMs=0;
    this.previous=undefined;this.navigator.invalidate();
  }
  override follow(position:WolfPoint,goal:WolfPoint,speed:number,delta:number):WolfPoint {
    return this.navigator.velocity(position,goal,speed,delta);
  }

}
