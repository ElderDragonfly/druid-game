import Phaser from 'phaser';
import type { Druid } from '../entities/Druid';
import { menuMusic } from '../audio/MenuMusic';
import { COMBAT_EVENTS } from '../combat/events';
import mushroom from '../../docs/art/mushroom-pickup-v1/mushroom.png';
import chime from '../../docs/audio/pickup-chime-v1/pickup-chime.wav';

export const PICKUP_ART={key:'pickup-mushroom',url:mushroom};
export const PICKUP_CHIME={key:'pickup-chime',url:chime};
type Sound=Phaser.Sound.WebAudioSound|Phaser.Sound.HTML5AudioSound|Phaser.Sound.NoAudioSound;

/** Reusable, cosmetic item confirmation. It never pauses or changes actor stats. */
export class PickupFeedback {
  readonly icon:Phaser.GameObjects.Image;
  readonly shine:Phaser.GameObjects.Graphics;
  private readonly sound:Sound;
  private readonly preferences:ReturnType<typeof menuMusic>;
  private elapsed=1100;
  readonly durationMs=1100;
  get active(){return this.elapsed<this.durationMs;}

  constructor(private scene:Phaser.Scene,private player:Druid){
    this.shine=scene.add.graphics().setDepth(90000).setVisible(false).setName('pickup-shine');
    this.icon=scene.add.image(0,0,PICKUP_ART.key).setDisplaySize(40*2/3,40*2/3*152/158)
      .setDepth(90001).setVisible(false).setName('pickup-item');
    this.icon.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.sound=scene.sound.add(PICKUP_CHIME.key) as Sound;
    this.preferences=menuMusic(scene.game);
    scene.events.on('witch-circle-collected',this.play,this);
    player.on(COMBAT_EVENTS.died,this.hide,this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN,this.destroy,this);
  }
  play(){
    if(this.player.dead)return;
    this.elapsed=0;this.update(0);
    const preferences=this.preferences;
    if(preferences.enabled&&preferences.volume>0&&!this.sound.manager.locked){
      this.sound.stop();this.sound.play({volume:preferences.volume*.55});
    }
  }
  update(delta:number){
    if(!this.active)return;
    if(this.player.dead){this.hide();return;}
    this.elapsed=Math.min(this.durationMs,this.elapsed+Math.max(0,delta));
    if(!this.active){this.hide();return;}
    const t=this.elapsed/this.durationMs,fade=Math.min(1,this.elapsed/90,(this.durationMs-this.elapsed)/240);
    const x=Math.round(this.player.x),y=Math.round(this.player.getTopLeft().y-29-10*Math.sin(t*Math.PI/2));
    this.icon.setPosition(x,y).setAlpha(fade).setVisible(true);
    const pulse=.65+.35*Math.sin(Math.PI*t);
    this.shine.clear().setPosition(x,y).setAlpha(fade).setVisible(true);
    this.shine.fillStyle(0xf5d878,.16*pulse).fillCircle(0,0,25);
    this.shine.fillStyle(0xffedb3,.22*pulse).fillCircle(0,0,19);
    this.shine.fillStyle(0xffe6a0,.9);
    for(let i=0;i<6;i++){
      const angle=i*Math.PI/3,rx=Math.round(Math.cos(angle)*(27+3*pulse)),ry=Math.round(Math.sin(angle)*(27+3*pulse));
      this.shine.fillRect(rx-3,ry-1,6,2).fillRect(rx-1,ry-3,2,6);
    }
  }
  private hide(){this.elapsed=this.durationMs;this.icon.setVisible(false);this.shine.setVisible(false);}
  destroy(){
    this.scene.events.off('witch-circle-collected',this.play,this);
    this.player.off(COMBAT_EVENTS.died,this.hide,this);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN,this.destroy,this);
    this.sound.destroy();this.icon.destroy();this.shine.destroy();
  }
}
