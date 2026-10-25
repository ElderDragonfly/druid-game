import Phaser from 'phaser';
import { BUSH_TRAPS as C } from '../data/bushTraps';
import { WITCH_CIRCLE } from '../data/witchCircle';
import type { Druid } from '../entities/Druid';
import type { BushTrapsSave, BushRunnerSave } from '../persistence/snapshots';
import { sweptRect, type Point } from '../physics/projectileSweep';
import type { ForestBushes } from '../rendering/ForestBushes';
import type { MeadowLayout } from './meadowLayout';
import { roomAt } from './rooms';
import { seededRandom } from './random';
import { bushCenter, bushTrapRoute, inWitchSanctuary, routeLength, routePosition } from './bushTrapRoutes';

interface Runner extends BushRunnerSave { path:Point[]; length:number; visual?:Phaser.GameObjects.Arc }

/** Non-physical hazards: one warned wave at a time, with open space between lanes. */
export class BushTraps {
  enabled=true;
  readonly runners:Runner[]=[];
  private waitMs:number=C.initialDelayMs;
  private wave=0;
  constructor(private scene:Phaser.Scene,private layout:MeadowLayout,private bushes:ForestBushes,
    private player:Druid,saved?:BushTrapsSave){
      if(saved)this.restore(saved);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN,this.destroy,this);
    }

  private get sanctuary(){return this.layout.witchCircle!;}

  startWave() {
    if(this.runners.length||!this.sanctuary)return;
    const random=seededRandom(this.layout.seed^Math.imul(++this.wave,0x42545250));
    const count=C.minPerWave+Math.floor(random()*(C.maxPerWave-C.minPerWave+1));
    const angle=Math.floor(random()*4)*Math.PI/4,axis={x:Math.cos(angle),y:Math.sin(angle)};
    const positions=(this.layout.bushes??[]).map(bushCenter),point=this.player.body!.center;
    const candidates:{source:number;target:number;lane:number;score:number;aligned:boolean}[]=[];
    for(let source=0;source<positions.length;source++)for(let target=0;target<positions.length;target++){
      if(source===target)continue;
      const a=positions[source],b=positions[target],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
      if(d<C.minDistance||d>C.maxDistance||
        Math.hypot(a.x-point.x,a.y-point.y)>620)continue;
      const middle={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      candidates.push({source,target,lane:-middle.x*axis.y+middle.y*axis.x,aligned:Math.abs((dx*axis.x+dy*axis.y)/d)>=.88,
        score:Math.hypot(middle.x-point.x,middle.y-point.y)+random()*150});
    }
    candidates.sort((a,b)=>a.score-b.score);
    const sources=new Set<number>(),targets=new Set<number>(),lanes:number[]=[];
    let delayMs=0;
    // Spread the first lanes out. Extra staggered starts may reuse a corridor
    // rather than fill its walking gaps with another tightly packed lane.
    for(const mode of ['spread','reuse','fill']){
      const distanceToLane=(lane:number)=>Math.min(...lanes.map(other=>Math.abs(other-lane)));
      const ordered=mode==='reuse'?[...candidates].sort((a,b)=>distanceToLane(a.lane)-distanceToLane(b.lane)||a.score-b.score):candidates;
      for(const candidate of ordered){
        if(this.runners.length===count)break;
        const {source,target,lane}=candidate;
        if((mode!=='fill'&&!candidate.aligned)||sources.has(source)||targets.has(target))continue;
        if(mode==='spread'&&lanes.some(other=>Math.abs(other-lane)<72))continue;
        const path=bushTrapRoute(positions[source],positions[target],this.sanctuary);
        if(path.length<2)continue;
        this.runners.push({source,target,phase:'warning',elapsed:0,distance:0,delayMs,path,length:routeLength(path)});
        sources.add(source);targets.add(target);lanes.push(lane);
        if(!delayMs)this.bushes.rustle(source,0);
        delayMs+=C.staggerMinMs+random()*(C.staggerMaxMs-C.staggerMinMs);
      }
    }
    this.waitMs=C.restMinMs+random()*(C.restMaxMs-C.restMinMs);
  }

  update(delta:number) {
    if(!this.enabled||this.player.dead||!Number.isFinite(delta)||delta<0)return;
    if(!this.runners.length){
      if(roomAt(this.layout,this.player.body!.center)!==WITCH_CIRCLE.roomId)return;
      this.waitMs-=delta;if(this.waitMs<=0)this.startWave();return;
    }
    for(let i=this.runners.length-1;i>=0;i--){
      const runner=this.runners[i];let remaining=delta;
      if((runner.delayMs??0)>0){
        const spent=Math.min(remaining,runner.delayMs!);runner.delayMs=runner.delayMs!-spent;remaining-=spent;
        if(runner.delayMs>0)continue;
      }
      if(runner.phase==='warning'){
        const spent=Math.min(remaining,C.warningMs-runner.elapsed);runner.elapsed+=spent;remaining-=spent;
        this.bushes.rustle(runner.source,runner.elapsed/C.warningMs);
        if(runner.elapsed<C.warningMs)continue;
        this.bushes.rustle(runner.source);runner.phase='moving';this.show(runner);
        this.damage(runner.path[0],runner.path[0]); // Harmful from the instant it appears.
      }
      if(this.player.dead)break;
      const end=Math.min(runner.length,runner.distance+C.speed*remaining/1000);
      let cursor=runner.distance;
      // Sweep each path segment separately: a large frame never cuts the oval.
      let boundary=0;
      for(let j=1;j<runner.path.length;j++){
        boundary+=Math.hypot(runner.path[j].x-runner.path[j-1].x,runner.path[j].y-runner.path[j-1].y);
        if(boundary<=cursor)continue;
        const next=Math.min(end,boundary);
        this.damage(routePosition(runner.path,cursor),routePosition(runner.path,next));cursor=next;
        if(cursor>=end||this.player.dead)break;
      }
      runner.distance=end;this.show(runner);
      if(this.player.dead)break;
      if(end>=runner.length){runner.visual?.destroy();this.runners.splice(i,1);}
    }
  }

  private damage(from:Point,to:Point){
    const body=this.player.body!;
    if(!this.player.dead&&!inWitchSanctuary(body.center,this.sanctuary)&&
      sweptRect(from,to,{x:body.x,y:body.y,width:body.width,height:body.height},C.radius)!==undefined)
      this.player.takeDamage(C.damage);
  }
  private show(runner:Runner){
    const p=routePosition(runner.path,runner.distance);
    if(!runner.visual){
      runner.visual=this.scene.add.circle(p.x,p.y,C.radius,0xefb25b).setStrokeStyle(2,0x44281a)
        .setName('bush-trap-runner');
      this.scene.cameras.getCamera('hud')?.ignore(runner.visual);
    }
    runner.visual.setPosition(p.x,p.y).setDepth(p.y+1);
  }

  snapshot():BushTrapsSave {
    return {wave:this.wave,waitMs:this.waitMs,runners:this.runners.map(({source,target,phase,elapsed,distance,delayMs})=>
      ({source,target,phase,elapsed,distance,...(delayMs?{delayMs}:{})}))};
  }
  restore(saved:BushTrapsSave){
    this.clear();this.wave=saved.wave;this.waitMs=saved.waitMs;
    for(const entry of saved.runners){
      const source=this.layout.bushes?.[entry.source],target=this.layout.bushes?.[entry.target];
      if(!source||!target||!this.sanctuary)continue;
      const path=bushTrapRoute(bushCenter(source),bushCenter(target),this.sanctuary);
      if(path.length<2)continue;
      const runner:Runner={...entry,path,length:routeLength(path)};
      this.runners.push(runner);
      if(entry.phase==='warning'){
        if(!(entry.delayMs??0))this.bushes.rustle(entry.source,entry.elapsed/C.warningMs);
      }
      else this.show(runner);
    }
  }
  private clear(){
    for(const runner of this.runners){runner.visual?.destroy();this.bushes.rustle(runner.source);}
    this.runners.length=0;
  }
  destroy(){
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN,this.destroy,this);
    this.clear();this.enabled=false;
  }
}
