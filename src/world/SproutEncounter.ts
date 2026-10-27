import Phaser from 'phaser';
import { ForestSprout,type SproutSave } from '../entities/ForestSprout';
import { FOREST_SPROUT as C } from '../data/forestSprout';
import { ForestBushes } from '../rendering/ForestBushes';
import { WolfNavigation } from './WolfNavigation';
import type { MeadowLayout } from './meadowLayout';
import type { Druid } from '../entities/Druid';

export interface SproutEncounterSave{released:boolean;enemies:SproutSave[];approachAngle?:number}
export class SproutEncounter{
  readonly enemies:ForestSprout[]=[];
  readonly bushes:ForestBushes;
  released=false;
  private approachAngle?:number;
  private readonly navigation:WolfNavigation;
  constructor(scene:Phaser.Scene,layout:MeadowLayout,obstacles:Phaser.Physics.Arcade.StaticGroup,private player:Druid,
    saved:SproutEncounterSave|undefined,register:(enemy:ForestSprout)=>void){
    const area=layout.sproutRoom!,nav=new WolfNavigation(layout,C.body);this.navigation=nav;
    this.bushes=new ForestBushes(scene,area.bushes,'sprout-bush');this.released=saved?.released??false;
    this.approachAngle=saved?.approachAngle;
    (saved?.enemies??area.enemies).forEach((p,i)=>{
      const e=new ForestSprout(scene,nav,obstacles,player,p);if(saved)e.restore(saved.enemies[i]);
      this.enemies.push(e);register(e);
    });
  }
  update(delta:number){
    const active=this.enemies.filter(e=>e.active&&e.body?.enable&&!e.dying);
    const p=this.player.body as Phaser.Physics.Arcade.Body;
    if(this.approachAngle===undefined&&active.some(e=>e.actorState.phase!=='buried')){
      const x=active.reduce((n,e)=>n+e.x,0)/active.length,y=active.reduce((n,e)=>n+e.y,0)/active.length;
      this.approachAngle=Math.atan2(y-p.bottom,x-p.center.x);
    }
    if(!this.released){
      this.released=this.enemies.every(e=>e.emerged);
      for(const e of active){
        const t=e.actorState.target===null?undefined:this.enemies[e.actorState.target];
        if(['seeking','waking'].includes(e.actorState.phase)&&(!t||t.dying||t.actorState.phase!=='buried')){
          e.actorState.target=null;e.enter('waiting');
        }
      }
      const sleepers=active.filter(e=>e.actorState.phase==='buried');
      const assigned=(t:ForestSprout)=>active.filter(e=>e.actorState.target===this.enemies.indexOf(t)).length;
      // Spread helpers over different sleeping neighbours first. Extra helpers
      // approach a shared target from their own side instead of waiting in place.
      for(const e of active.filter(e=>e.actorState.phase==='waiting')){
        const target=[...sleepers].sort((a,b)=>assigned(a)-assigned(b)||Math.hypot(a.x-e.x,a.y-e.y)-Math.hypot(b.x-e.x,b.y-e.y))[0];
        if(target){e.actorState.target=this.enemies.indexOf(target);e.navigator.invalidate();e.enter('seeking');}
      }
    }
    for(const e of this.enemies){
      if(this.player.dead)break;
      const target=e.actorState.target===null?undefined:this.enemies[e.actorState.target];
      const formation=e.emerged?this.approach(e,active.indexOf(e)):undefined;
      let goal=formation?.point;
      if(!this.released&&target){
        const helpers=active.filter(a=>a.actorState.target===e.actorState.target);
        if(helpers.indexOf(e)>0){
          const angle=Math.atan2(e.y-target.y,e.x-target.x);
          const side={x:target.x+Math.cos(angle)*32,y:target.y+Math.sin(angle)*32};
          goal=this.navigation.canStand(side)?side:target;
        }else goal=target;
      }
      e.step(delta,this.released,target,goal,formation?.canAttack??true);
    }
  }
  private approach(e:ForestSprout,index:number){
    const p=this.player.body as Phaser.Physics.Arcade.Body,player={x:p.center.x,y:p.bottom};
    if(index<=0||e.actorState.flankReached)return {point:player,canAttack:true};
    const offset=[0,50,-50,100,-100,180][index%6]*Math.PI/180;
    for(const radius of [145,180,115])for(const adjust of [0,15,-15,30,-30]){
      const angle=(this.approachAngle??0)+offset+adjust*Math.PI/180;
      const point={x:player.x+Math.cos(angle)*radius,y:player.y+Math.sin(angle)*radius};
      if(!this.navigation.canStand(point))continue;
      if(Math.hypot(e.x-point.x,e.y-point.y)<28){
        e.actorState.flankReached=true;return {point:player,canAttack:true};
      }
      return {point,canAttack:false};
    }
    return {point:player,canAttack:true};
  }
  snapshot():SproutEncounterSave{return {released:this.released,enemies:this.enemies.map(e=>e.snapshot()),approachAngle:this.approachAngle};}
  destroy(){this.enemies.forEach(e=>e.destroy());this.bushes.destroy();}
}
