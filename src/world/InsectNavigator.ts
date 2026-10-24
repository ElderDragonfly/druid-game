import type { WolfNavigation, WolfPoint } from './WolfNavigation';
import { overlaps, type Rect } from './geometry';
import { FOREST_INSECT } from '../data/forestInsect';

/** Retains obstacle waypoints; the decorative wave never replaces a detour. */
export class InsectNavigator {
  private path:WolfPoint[]=[];
  private goal?:WolfPoint;
  private age=Infinity;
  private previous?:WolfPoint;
  private previousSpeed=0;
  private blockedMs=0;
  private peers:()=>readonly Rect[]=()=>[];
  detouring=false;

  constructor(private readonly navigation:WolfNavigation){}
  setPeers(read:()=>readonly Rect[]){this.peers=read;}
  invalidate(){this.path=[];this.goal=undefined;this.age=Infinity;this.previous=undefined;this.blockedMs=0;}
  nearPeer(p:WolfPoint){return this.peers().some(r=>Math.hypot(r.x+r.width/2-p.x,r.y+r.height-p.y)<80);}

  velocity(position:WolfPoint,goal:WolfPoint,speed:number,delta:number):WolfPoint {
    const dt=Math.max(0,delta);this.age+=dt;
    const travelled=this.previous?Math.hypot(position.x-this.previous.x,position.y-this.previous.y):Infinity;
    this.previous={...position};
    this.blockedMs=this.previousSpeed>1&&travelled<this.previousSpeed*dt/1000*.2?this.blockedMs+dt:0;
    if(this.blockedMs>=240){this.age=Infinity;this.blockedMs=0;}
    const obstructed=this.path[0]&&!this.navigation.clear(position,this.path[0],-.05);
    if(this.age>=350||!this.goal||Math.hypot(goal.x-this.goal.x,goal.y-this.goal.y)>24||!this.path.length||obstructed) {
      this.path=this.navigation.routeFromContact(position,goal);this.goal={...goal};this.age=0;
    }
    while(this.path.length&&Math.hypot(this.path[0].x-position.x,this.path[0].y-position.y)<2)this.path.shift();
    // Keep a turning waypoint until the whole body really fits past the corner.
    while(this.path.length>1&&this.navigation.clear(position,this.path[1]))this.path.shift();
    const next=this.path[0];
    this.detouring=!this.navigation.clear(position,goal)||!this.navigation.canStand(position,22)||this.nearPeer(position);
    if(!next){this.previousSpeed=0;return {x:0,y:0};}
    const dx=next.x-position.x,dy=next.y-position.y,distance=Math.hypot(dx,dy);
    const pace=Math.min(Math.max(0,speed),distance/Math.max(dt/1000,.001));
    const desired={x:dx/distance*pace,y:dy/distance*pace};
    const velocity=this.avoidPeers(position,desired,Math.min(36,distance));
    this.previousSpeed=Math.hypot(velocity.x,velocity.y);return velocity;
  }
  waveVelocity(position:WolfPoint,wave:WolfPoint,base:WolfPoint):WolfPoint {
    const speed=Math.hypot(wave.x,wave.y);if(!speed)return base;
    const ahead={x:position.x+wave.x/speed*32,y:position.y+wave.y/speed*32};
    return this.navigation.clear(position,ahead)?wave:base;
  }
  private avoidPeers(position:WolfPoint,desired:WolfPoint,distance:number):WolfPoint {
    const peers=this.peers(),speed=Math.hypot(desired.x,desired.y);
    if(!peers.length||!speed)return desired;
    const safe=(dx:number,dy:number)=>{
      for(let n=0,steps=Math.max(1,Math.ceil(distance/4));n<=steps;n++) {
        const x=position.x+dx*distance*n/steps,y=position.y+dy*distance*n/steps;
        const {width,height}=FOREST_INSECT.body,foot={x:x-width/2,y:y-height,width,height};
        if(peers.some(r=>overlaps(foot,r,-.05)))return false;
      }
      return this.navigation.clear(position,{x:position.x+dx*distance,y:position.y+dy*distance},-.05);
    };
    // A consistent turning side prevents two approaching flies from mirroring
    // each other's evasions forever. Physics remains the final collision guard.
    for(const degrees of [0,30,-30,60,-60,90,-90,120,-120,150,-150,180]) {
      const angle=degrees*Math.PI/180,dx=(desired.x*Math.cos(angle)-desired.y*Math.sin(angle))/speed,
        dy=(desired.y*Math.cos(angle)+desired.x*Math.sin(angle))/speed;
      if(safe(dx,dy))return {x:dx*speed,y:dy*speed};
    }
    return {x:0,y:0};
  }
}
