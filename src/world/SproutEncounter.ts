import Phaser from 'phaser';
import { ForestSprout,type SproutSave } from '../entities/ForestSprout';
import { FOREST_SPROUT as C } from '../data/forestSprout';
import { ForestBushes } from '../rendering/ForestBushes';
import { WolfNavigation } from './WolfNavigation';
import type { MeadowLayout } from './meadowLayout';
import type { Druid } from '../entities/Druid';

export interface SproutEncounterSave{released:boolean;enemies:SproutSave[]}
export class SproutEncounter{
  readonly enemies:ForestSprout[]=[];
  readonly bushes:ForestBushes;
  released=false;
  constructor(scene:Phaser.Scene,layout:MeadowLayout,obstacles:Phaser.Physics.Arcade.StaticGroup,private player:Druid,
    saved:SproutEncounterSave|undefined,register:(enemy:ForestSprout)=>void){
    const area=layout.sproutRoom!,nav=new WolfNavigation(layout,C.body);
    this.bushes=new ForestBushes(scene,area.bushes,'sprout-bush');this.released=saved?.released??false;
    (saved?.enemies??area.enemies).forEach((p,i)=>{
      const e=new ForestSprout(scene,nav,obstacles,player,p);if(saved)e.restore(saved.enemies[i]);
      this.enemies.push(e);register(e);
    });
  }
  update(delta:number){
    if(!this.released){
      this.released=this.enemies.every(e=>e.emerged);
      // Only one messenger at a time. Its newly awakened neighbour takes over;
      // completed messengers wait until every survivor has emerged.
      for(const e of this.enemies){
        if(e.dying||!e.active||!e.body?.enable)continue;
        const t=e.actorState.target===null?undefined:this.enemies[e.actorState.target];
        if(['seeking','waking'].includes(e.actorState.phase)&&(!t||t.dying||t.actorState.phase!=='buried')){
          e.actorState.target=null;e.enter('waiting');
        }
      }
      const messenger=this.enemies.some(e=>!e.dying&&['seeking','waking'].includes(e.actorState.phase));
      if(!this.released&&!messenger&&!this.enemies.some(e=>e.actorState.phase==='emerging')){
        const waiting=this.enemies.filter(e=>e.active&&e.body?.enable&&!e.dying&&e.actorState.phase==='waiting');
        const e=waiting.find(e=>!e.actorState.hasWokenOne)??waiting[0];
        if(e){
          const target=this.enemies.filter(t=>t.active&&!t.dying&&t.actorState.phase==='buried')
            .sort((a,b)=>Math.hypot(a.x-e.x,a.y-e.y)-Math.hypot(b.x-e.x,b.y-e.y))[0];
          if(target){e.actorState.target=this.enemies.indexOf(target);e.navigator.invalidate();e.enter('seeking');}
        }
      }
    }
    for(const e of this.enemies){if(this.player.dead)break;e.step(delta,this.released,e.actorState.target===null?undefined:this.enemies[e.actorState.target]);}
  }
  snapshot():SproutEncounterSave{return {released:this.released,enemies:this.enemies.map(e=>e.snapshot())};}
  destroy(){this.enemies.forEach(e=>e.destroy());this.bushes.destroy();}
}
