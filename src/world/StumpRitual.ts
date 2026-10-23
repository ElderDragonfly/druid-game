import Phaser from 'phaser';
import { STUMP } from '../data/stump';
import { distanceToStump, type StumpPlacement } from './stump';
import type { HoldInteractionTarget } from '../interaction/HoldInteraction';

/** The ritual's state/feedback is independent of future enemy-wave rules. */
export class StumpRitual implements HoldInteractionTarget {
  activated:boolean;
  private clock=0;
  readonly image:Phaser.GameObjects.Image;
  private glow:Phaser.GameObjects.Image;
  private ring:Phaser.GameObjects.Graphics;

  constructor(private scene:Phaser.Scene,readonly position:StumpPlacement,activated=false) {
    this.activated=activated;
    const a=STUMP.art;
    scene.textures.get(STUMP.texture).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.image=scene.add.image(position.x,position.y,STUMP.texture)
      .setOrigin(a.anchorX/a.width,a.anchorY/a.height).setScale(a.scale).setDepth(position.y+3).setName('ritual-stump');
    this.glow=scene.add.image(position.x,position.y,STUMP.texture)
      .setOrigin(this.image.originX,this.image.originY).setScale(a.scale).setDepth(position.y+3.1)
      .setTint(0xb0ed78).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setName('ritual-stump-glow');
    this.ring=scene.add.graphics().setDepth(position.y+4).setName('ritual-stump-aura');
    this.draw();
  }
  canInteract(point:StumpPlacement){return !this.activated&&distanceToStump(this.position,point)<=STUMP.interactionRadius;}
  completeInteraction() {
    if(this.activated)return;
    this.activated=true;
    this.scene.events.emit('stump-activated',{...this.position});
    this.draw();
  }
  update(delta:number) {
    this.clock+=Math.min(100,Math.max(0,delta));
    this.draw();
  }
  private draw() {
    const {x,y}=this.position;
    this.ring.clear();
    this.glow.setAlpha(this.activated ? .16+.04*Math.sin(this.clock/700) : 0);
    if(this.activated) {
      const pulse=.5+.5*Math.sin(this.clock/850);
      this.ring.fillStyle(0x9bce75,.09+.025*pulse).fillEllipse(x,y-8,105,40);
      this.ring.lineStyle(1.5,0xb9dd87,.4+.15*pulse).strokeEllipse(x,y-8,98,35);
    }
  }
  destroy(){this.image.destroy();this.glow.destroy();this.ring.destroy();}
}
