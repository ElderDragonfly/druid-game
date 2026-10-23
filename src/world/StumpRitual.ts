import Phaser from 'phaser';
import { STUMP } from '../data/stump';
import { distanceToStump, type StumpPlacement } from './stump';
import type { HoldInteractionTarget } from '../interaction/HoldInteraction';

/** The ritual's state/feedback is independent of future enemy-wave rules. */
export class StumpRitual implements HoldInteractionTarget {
  activated:boolean;
  readonly image:Phaser.GameObjects.Image;

  constructor(private scene:Phaser.Scene,readonly position:StumpPlacement,activated=false) {
    this.activated=activated;
    const a=STUMP.art;
    scene.textures.get(STUMP.texture).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.image=scene.add.image(position.x,position.y,STUMP.texture)
      .setOrigin(a.anchorX/a.width,a.anchorY/a.height).setScale(a.scale).setDepth(position.y+3).setName('ritual-stump');
  }
  canInteract(point:StumpPlacement){return !this.activated&&distanceToStump(this.position,point)<=STUMP.interactionRadius;}
  completeInteraction() {
    if(this.activated)return;
    this.activated=true;
    this.scene.events.emit('stump-activated',{...this.position});
  }
  destroy(){this.image.destroy();}
}
