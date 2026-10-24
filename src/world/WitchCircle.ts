import Phaser from 'phaser';
import { WITCH_CIRCLE as CONFIG } from '../data/witchCircle';
import { WITCH_ART_METRICS as ART } from '../rendering/witchCircleArt';
import type { WitchCirclePlacement } from './witchGrove';
import type { HoldInteractionTarget } from '../interaction/HoldInteraction';

export class WitchCircle implements HoldInteractionTarget {
  readonly holdDurationMs=CONFIG.holdDurationMs;
  readonly ring:Phaser.GameObjects.Image[]=[];
  readonly central:Phaser.GameObjects.Image;
  constructor(private scene:Phaser.Scene,readonly position:WitchCirclePlacement,public collected=false){
    for(const [i,m] of position.mushrooms.entries()){
      const a=ART.sprites[m.variant];
      this.ring.push(scene.add.image(m.x,m.y,'witch-circle-ring',a.id).setOrigin(a.anchorX/a.width,a.anchorY/a.height)
        .setScale(m.height/a.height).setDepth(m.y).setName(`witch-ring-mushroom-${i}`));
    }
    const a=ART.central;
    this.central=scene.add.image(position.x,position.y,'witch-circle-central')
      .setOrigin(a.anchorX/a.width,a.anchorY/a.height).setScale(CONFIG.centralHeight/a.height)
      .setDepth(position.y).setVisible(!collected).setName('witch-circle-central');
  }
  canInteract(point:{x:number;y:number}){
    return !this.collected&&Math.hypot((point.x-this.position.x)/CONFIG.radiusX,(point.y-this.position.y)/CONFIG.radiusY)<=1;
  }
  completeInteraction(){
    if(this.collected)return;
    this.collected=true;this.central.setVisible(false);
    this.scene.events.emit('witch-circle-collected',{x:this.position.x,y:this.position.y});
  }
  destroy(){this.central.destroy();this.ring.forEach(m=>m.destroy());this.ring.length=0;}
}
