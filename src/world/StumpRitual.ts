import Phaser from 'phaser';
import { STUMP } from '../data/stump';
import { distanceToStump, type StumpPlacement } from './stump';

/** The ritual's state/feedback is independent of future enemy-wave rules. */
export class StumpRitual {
  activated:boolean;
  private heldMs=0;
  private clock=0;
  readonly image:Phaser.GameObjects.Image;
  private glow:Phaser.GameObjects.Image;
  private ring:Phaser.GameObjects.Graphics;
  private badge:Phaser.GameObjects.Text;
  get progress(){return this.activated?1:this.heldMs/STUMP.holdMs;}

  constructor(private scene:Phaser.Scene,readonly position:StumpPlacement,activated=false) {
    this.activated=activated;
    const a=STUMP.art;
    scene.textures.get(STUMP.texture).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.image=scene.add.image(position.x,position.y,STUMP.texture)
      .setOrigin(a.anchorX/a.width,a.anchorY/a.height).setScale(a.scale).setDepth(position.y+3).setName('ritual-stump');
    this.glow=scene.add.image(position.x,position.y,STUMP.texture)
      .setOrigin(this.image.originX,this.image.originY).setScale(a.scale).setDepth(position.y+3.1)
      .setTint(0xb0ed78).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setName('ritual-stump-glow');
    this.ring=scene.add.graphics().setDepth(position.y+4).setName('ritual-stump-ring');
    this.badge=scene.add.text(position.x,position.y+25,'E',{fontFamily:'monospace',fontSize:'14px',
      color:'#e9e6bd',backgroundColor:'#1b2b1d',padding:{x:5,y:3}}).setOrigin(.5).setDepth(position.y+5)
      .setName('ritual-stump-key').setVisible(false);
    this.draw(false);
  }
  canInteract(point:StumpPlacement){return !this.activated&&distanceToStump(this.position,point)<=STUMP.interactionRadius;}
  cancelHold(){this.heldMs=0;this.draw(false);}
  update(delta:number,point:StumpPlacement,holding:boolean,available:boolean) {
    const dt=Math.min(100,Math.max(0,delta));this.clock+=dt;
    const near=available&&this.canInteract(point);
    if(!this.activated) {
      this.heldMs=near&&holding?Math.min(STUMP.holdMs,this.heldMs+dt):0;
      if(this.heldMs>=STUMP.holdMs) {
        this.activated=true;
        this.scene.events.emit('stump-activated',{...this.position});
      }
    }
    this.draw(near&&!this.activated);
  }
  private draw(near:boolean) {
    const {x,y}=this.position;
    this.ring.clear();this.badge.setVisible(near);
    this.glow.setAlpha(this.activated ? .16+.04*Math.sin(this.clock/700) : 0);
    if(this.activated) {
      const pulse=.5+.5*Math.sin(this.clock/850);
      this.ring.fillStyle(0x9bce75,.09+.025*pulse).fillEllipse(x,y-8,105,40);
      this.ring.lineStyle(1.5,0xb9dd87,.4+.15*pulse).strokeEllipse(x,y-8,98,35);
      return;
    }
    if(!near)return;
    this.ring.lineStyle(1.5,0x9bb487,.35).strokeEllipse(x,y-8,98,35);
    if(this.progress>0) {
      this.ring.lineStyle(3,0xe8dda0,1).beginPath();
      const end=this.progress*Math.PI*2;
      for(let step=0;step<=64;step++) {
        const angle=-Math.PI/2+end*step/64,px=x+49*Math.cos(angle),py=y-8+17.5*Math.sin(angle);
        if(!step)this.ring.moveTo(px,py);else this.ring.lineTo(px,py);
      }
      this.ring.strokePath();
    }
  }
  destroy(){this.image.destroy();this.glow.destroy();this.ring.destroy();this.badge.destroy();}
}
