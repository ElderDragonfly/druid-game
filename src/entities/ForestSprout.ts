import Phaser from 'phaser';
import { FOREST_SPROUT as C } from '../data/forestSprout';
import { SPROUT_ART } from '../rendering/sproutRockArt';
import { EnemyNavigator } from '../world/EnemyNavigator';
import type { WolfNavigation } from '../world/WolfNavigation';
import { createDruidWolfCollider } from '../physics/wolfContact';
import type { Rect } from '../world/geometry';
import type { Druid } from './Druid';
import type { Damageable } from '../combat/Damageable';
import type { SproutPlacement } from '../world/sproutRoom';

export type SproutPhase='buried'|'emerging'|'waiting'|'seeking'|'waking'|'chase'|'windup'|'leap'|'recovery'|'dead';
export interface SproutState{
  health:number;maxHealth:number;speed:number;phase:SproutPhase;elapsed:number;
  hopDistance:number;target:number|null;leapTarget:{x:number;y:number};attackConnected:boolean;hasWokenOne:boolean;
}
export interface SproutSave extends SproutPlacement{state:SproutState}

/** Ground body stays at the feet; only its image makes a short, low jump. */
export class ForestSprout extends Phaser.Physics.Arcade.Sprite implements Damageable{
  readonly actorState:SproutState;
  readonly image:Phaser.GameObjects.Image;
  readonly shadow:Phaser.GameObjects.Ellipse;
  readonly navigator:EnemyNavigator;
  private treeCollider?:Phaser.Physics.Arcade.Collider;
  private playerCollider?:Phaser.Physics.Arcade.Collider;
  private previous:{x:number;y:number};
  private ignoredPeer?:{x:number;y:number};
  private readonly metrics;
  get dying(){return this.actorState.health<=0;}
  get emerged(){return this.actorState.phase!=='buried'&&this.actorState.phase!=='emerging';}

  constructor(scene:Phaser.Scene,navigation:WolfNavigation,obstacles:Phaser.Physics.Arcade.StaticGroup,
    private player:Druid,readonly placement:SproutPlacement){
    super(scene,placement.x,placement.y,'__WHITE');scene.add.existing(this);scene.physics.add.existing(this);
    this.metrics=SPROUT_ART[placement.variant].metrics;
    this.setName('forest-sprout').setVisible(false).setOrigin(.5,1)
      .setSize(C.body.width,C.body.height).setOffset(this.width*.5-C.body.width/2,this.height-C.body.height)
      .setPushable(false).setCollideWorldBounds(true);
    this.actorState={health:C.health,maxHealth:C.health,speed:C.speed,phase:'buried',elapsed:0,
      hopDistance:0,target:null,leapTarget:{x:this.x,y:this.y},attackConnected:false,hasWokenOne:false};
    this.previous={x:this.x,y:this.y};this.navigator=new EnemyNavigator(navigation,C.body);
    this.image=scene.add.image(this.x,this.y,`sprout-plant-${placement.variant}`).setOrigin(.5,1).setName('forest-sprout-art');
    this.shadow=scene.add.ellipse(this.x,this.y-2,32,9,0x102218,.22).setName('forest-sprout-shadow');
    this.treeCollider=scene.physics.add.collider(this,obstacles);
    this.playerCollider=createDruidWolfCollider(scene,player,this);
    scene.cameras.getCamera('hud')?.ignore([this,this.image,this.shadow]);this.drawPose();
  }
  setCollisionPeers(read:()=>readonly Rect[]){
    this.navigator.setPeers(()=>read().filter(r=>!this.ignoredPeer||
      Math.hypot(r.x+r.width/2-this.ignoredPeer.x,r.y+r.height-this.ignoredPeer.y)>2));
  }
  enter(phase:SproutPhase){this.actorState.phase=phase;this.actorState.elapsed=0;this.setVelocity(0,0);}
  wake(){
    if(this.dying||this.actorState.phase!=='buried')return false;
    this.enter('emerging');this.drawPose();return true;
  }
  takeDamage(amount:number){
    if(this.dying||!Number.isFinite(amount)||amount<=0)return false;
    if(this.actorState.phase==='buried'){this.wake();return true;}
    if(this.actorState.phase==='emerging')return false;
    this.actorState.health=Math.max(0,this.actorState.health-amount);
    if(this.dying){
      this.enter('dead');(this.body as Phaser.Physics.Arcade.Body).enable=false;
      this.treeCollider?.destroy();this.playerCollider?.destroy();this.treeCollider=undefined;this.playerCollider=undefined;
    }
    this.drawPose();return true;
  }
  step(delta:number,released:boolean,wakeTarget?:ForestSprout){
    if(!this.active)return;
    const s=this.actorState,dt=Math.max(0,delta),body=this.body as Phaser.Physics.Arcade.Body;
    s.elapsed+=dt;
    if(this.dying){this.drawPose();return;}
    if(!body.enable)return;
    const moved=Math.hypot(this.x-this.previous.x,this.y-this.previous.y);
    this.previous={x:this.x,y:this.y};if(moved<40)s.hopDistance+=moved;
    this.setVelocity(0,0);this.ignoredPeer=undefined;
    if(s.phase==='emerging'&&s.elapsed>=C.emergeMs)this.enter('waiting');
    if(!released){
      if(s.phase==='seeking'&&wakeTarget){
        this.ignoredPeer=wakeTarget;
        if(this.gapTo(wakeTarget.body as Phaser.Physics.Arcade.Body)<=16)this.enter('waking');
        else this.follow(wakeTarget,s.speed,dt);
      }else if(s.phase==='waking'&&s.elapsed>=C.tagMs){
        if(wakeTarget&&this.gapTo(wakeTarget.body as Phaser.Physics.Arcade.Body)<=20)wakeTarget.wake();
        s.hasWokenOne=true;s.target=null;this.enter('waiting');
      }
    }else{
      if(['waiting','seeking','waking'].includes(s.phase)){s.target=null;this.navigator.invalidate();this.enter('chase');}
      const p=this.player.body as Phaser.Physics.Arcade.Body,target={x:p.center.x,y:p.bottom};
      if(s.phase==='chase'){
        if(Math.hypot(this.x-target.x,this.y-target.y)<=C.attackDistance)this.enter('windup');
        else this.follow(target,s.speed,dt);
      }else if(s.phase==='windup'&&s.elapsed>=C.windupMs){
        s.leapTarget={...target};s.attackConnected=false;this.navigator.invalidate();this.enter('leap');
      }else if(s.phase==='leap'){
        this.follow(s.leapTarget,C.jumpSpeed,dt);
        if(!s.attackConnected&&this.gapTo(this.player.wolfContactBounds)<=C.contactGap){
          s.attackConnected=true;this.player.takeDamage(C.damage);
        }
        if(s.elapsed>=C.leapMs)this.enter('recovery');
      }else if(s.phase==='recovery'&&s.elapsed>=C.recoveryMs)this.enter('chase');
    }
    this.drawPose();
  }
  private follow(goal:{x:number;y:number},speed:number,delta:number){
    const v=this.navigator.velocity(this,goal,speed,delta);this.setVelocity(v.x,v.y);
  }
  private gapTo(r:Rect){
    const b=this.body as Phaser.Physics.Arcade.Body;
    return Math.hypot(Math.max(r.x-b.right,b.x-r.x-r.width,0),Math.max(r.y-b.bottom,b.y-r.y-r.height,0));
  }
  drawPose(){
    const s=this.actorState,m=this.metrics,feet=m.height-1,burial=(feet-m.plantBaseY)*m.scale;
    const buried=s.phase==='buried',emerging=s.phase==='emerging';
    const t=Math.min(1,s.elapsed/C.emergeMs),alpha=s.phase==='dead'?Math.max(0,1-s.elapsed/280):1;
    let lift=0,sx=1,sy=1;
    if(s.phase==='seeking'||s.phase==='chase')lift=Math.abs(Math.sin(s.hopDistance/46*Math.PI))*10;
    if(s.phase==='waking')lift=Math.sin(Math.min(1,s.elapsed/C.tagMs)*Math.PI)*9;
    if(s.phase==='leap')lift=Math.sin(Math.min(1,s.elapsed/C.leapMs)*Math.PI)*19;
    if(s.phase==='windup'){const v=Math.min(1,s.elapsed/C.windupMs);sx=1+v*.08;sy=1-v*.12;}
    this.image.setTexture(buried?`sprout-plant-${this.placement.variant}`:`sprout-${this.placement.variant}`)
      .setOrigin(.5,feet/m.height).setScale(m.scale*sx,m.scale*sy)
      .setPosition(this.x,this.y+(buried?burial:emerging?burial*(1-t):-lift))
      .setDepth(this.y).setAlpha(alpha).setVisible(alpha>0);
    if(emerging)this.image.setCrop(0,0,m.width,m.plantBaseY+(feet-m.plantBaseY)*t);
    else this.image.setCrop();
    this.shadow.setPosition(this.x,this.y-2).setDepth(this.y-.1).setAlpha(alpha*(buried?.1:.22))
      .setScale(1-lift/75).setVisible(alpha>0);
  }
  snapshot():SproutSave{return {x:this.x,y:this.y,variant:this.placement.variant,state:{...this.actorState,leapTarget:{...this.actorState.leapTarget}}};}
  restore(saved:SproutSave){
    Object.assign(this.actorState,saved.state,{leapTarget:{...saved.state.leapTarget}});
    const b=this.body as Phaser.Physics.Arcade.Body;b.reset(saved.x,saved.y);b.updateFromGameObject();
    this.previous={x:saved.x,y:saved.y};this.navigator.invalidate();
    if(this.dying){b.enable=false;this.treeCollider?.destroy();this.playerCollider?.destroy();this.treeCollider=undefined;this.playerCollider=undefined;}
    this.drawPose();
  }
  override destroy(fromScene?:boolean){
    if(!this.scene)return;this.treeCollider?.destroy();this.playerCollider?.destroy();this.image?.destroy();this.shadow?.destroy();super.destroy(fromScene);
  }
}
