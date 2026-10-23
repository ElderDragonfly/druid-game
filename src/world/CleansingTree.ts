import Phaser from 'phaser';
import { CLEANSING_TREE_METRICS as ART } from '../rendering/cleansingTreeArt';
import { ROOM_SCENARIOS } from '../data/roomScenarios';
import type { HoldInteractionTarget } from '../interaction/HoldInteraction';
import { ritualTreeRect, type RoomPlan } from './rooms';
export type CleansingStatus='dormant'|'active'|'cleansed';

export class CleansingTree implements HoldInteractionTarget {
  readonly image:Phaser.GameObjects.Image;
  constructor(private scene:Phaser.Scene,readonly room:RoomPlan,public status:CleansingStatus,
    private readonly startEncounter:()=>void) {
    const p=room.tree!;
    this.image=scene.add.image(p.x,p.y,'ritual-tree-corrupted').setName('cleansing-tree')
      .setOrigin(ART.anchorX/ART.width,ART.anchorY/ART.height).setScale(ART.scale).setDepth(p.y);
    this.refresh();
  }
  canInteract(point:{x:number;y:number}) {
    if(this.status!=='dormant')return false;
    const r=ritualTreeRect(this.room.tree!);
    return Math.hypot(Math.max(r.x-point.x,0,point.x-r.x-r.width),Math.max(r.y-point.y,0,point.y-r.y-r.height))<=ROOM_SCENARIOS.cleansing.interactionRadius;
  }
  completeInteraction() {
    if(this.status!=='dormant')return;
    this.startEncounter();this.status='active';
  }
  cleanse() {
    if(this.status!=='active')return;
    this.status='cleansed';this.refresh();
    // Reward design is intentionally open; this is the future reward hook.
    this.scene.events.emit('tree-cleansed',{roomId:this.room.id});
  }
  private refresh(){this.image.setTexture(this.status==='cleansed'?'ritual-tree-cleansed':'ritual-tree-corrupted');}
  destroy(){this.image.destroy();}
}
