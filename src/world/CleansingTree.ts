import Phaser from 'phaser';
import { CLEANSING_TREE_METRICS as ART, CLEANSING_GROWTH } from '../rendering/cleansingTreeArt';
import { ROOM_SCENARIOS } from '../data/roomScenarios';
import type { HoldInteractionTarget } from '../interaction/HoldInteraction';
import { ritualTreeInteractionRect, type RoomPlan } from './rooms';
export type CleansingStatus='dormant'|'active'|'cleansed';

export class CleansingTree implements HoldInteractionTarget {
  readonly image:Phaser.GameObjects.Image;
  readonly ground:Phaser.GameObjects.Image;
  private growthElapsed:number|null=null;
  get cleansingElapsed(){return this.growthElapsed??undefined;}
  constructor(private scene:Phaser.Scene,readonly room:RoomPlan,public status:CleansingStatus,
    private readonly startEncounter:()=>void,cleansingElapsed?:number) {
    const p=room.tree!;
    this.image=scene.add.image(p.x,p.y,'ritual-tree-corrupted').setName('cleansing-tree')
      .setOrigin(ART.anchorX/ART.width,ART.anchorY/ART.height).setScale(ART.scale).setDepth(p.y);
    this.ground=scene.add.image(p.x,p.y,'ritual-tree-corrupted-ground').setName('cleansing-tree-ground')
      .setOrigin(this.image.originX,this.image.originY).setScale(ART.scale).setDepth(-1);
    this.growthElapsed=status==='active'&&cleansingElapsed!==undefined?cleansingElapsed:null;
    this.refresh();
  }
  canInteract(point:{x:number;y:number}) {
    if(this.status!=='dormant')return false;
    const r=ritualTreeInteractionRect(this.room.tree!);
    return Math.hypot(Math.max(r.x-point.x,0,point.x-r.x-r.width),Math.max(r.y-point.y,0,point.y-r.y-r.height))<=ROOM_SCENARIOS.cleansing.interactionRadius;
  }
  completeInteraction() {
    if(this.status!=='dormant')return;
    this.startEncounter();this.status='active';
  }
  cleanse() {
    if(this.status!=='active'||this.growthElapsed!==null)return;
    this.growthElapsed=0;
  }
  update(delta:number) {
    if(this.growthElapsed===null||this.status!=='active')return;
    this.growthElapsed=Math.min(CLEANSING_GROWTH.durationMs,this.growthElapsed+Math.max(0,delta));
    this.refresh();
    if(this.growthElapsed<CLEANSING_GROWTH.durationMs)return;
    this.status='cleansed';this.growthElapsed=null;this.refresh();
    // Reward design is intentionally open; this is the future reward hook.
    this.scene.events.emit('tree-cleansed',{roomId:this.room.id});
  }
  private refresh(){
    const frame=this.growthElapsed===null?0:Math.min(7,Math.floor(this.growthElapsed/CLEANSING_GROWTH.frameMs));
    const texture=this.status==='cleansed'||frame===7?'ritual-tree-cleansed':
      frame?`ritual-tree-transition-${frame}`:'ritual-tree-corrupted';
    this.image.setTexture(texture);this.ground.setTexture(texture+'-ground');
  }
  destroy(){this.image.destroy();this.ground.destroy();}
}
