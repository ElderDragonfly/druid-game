import Phaser from 'phaser';
import { FOREST_INSECT as CONFIG } from '../data/forestInsect';
import { InsectFlight } from '../behavior/InsectFlight';
import type { WolfNavigation, WolfPoint } from '../world/WolfNavigation';
import { createDruidWolfCollider } from '../physics/wolfContact';
import { INSECT_METRICS as ART, insectDurations, type InsectAnimation, type InsectDirection } from '../rendering/forestInsectArt';
import type { Druid } from './Druid';
import type { Damageable, DamageDirection } from '../combat/Damageable';
import type { ForestInsectSave } from '../persistence/snapshots';

/** Source fly reel, horizontal mirroring, airborne launch and ground combat. */
export class ForestInsect extends Phaser.Physics.Arcade.Sprite implements Damageable {
  readonly behavior:InsectFlight;
  readonly shadow:Phaser.GameObjects.Image;
  readonly airborne:Phaser.GameObjects.Image;
  get projectileTargetable(){return !this.behavior.launching&&!this.dying;}
  get actorState(){return this.behavior.actorState;}
  get dying(){return this.actorState.health<=0;}
  get deathFinished(){return this.dying&&this.deathElapsed>=CONFIG.deathDurationMs;}
  private animation:InsectAnimation='fly';
  private facing:InsectDirection='right';
  private clock=0;
  private attackConnected=false;
  private hitElapsed:number|null=null;
  private hitPush:DamageDirection={x:0,y:0};
  private deathElapsed=0;
  private treeCollider?:Phaser.Physics.Arcade.Collider;
  private playerCollider?:Phaser.Physics.Arcade.Collider;

  constructor(scene:Phaser.Scene,navigation:WolfNavigation,obstacles:Phaser.Physics.Arcade.StaticGroup,
    private readonly player:Druid,start:WolfPoint,identity:number) {
    super(scene,start.x,start.y,'insect-fly','0');scene.add.existing(this);scene.physics.add.existing(this);
    const scale=CONFIG.appearance.scale,b=CONFIG.body;
    this.setName('forest-insect').setOrigin(ART.feetX/ART.width,ART.feetY/ART.height).setScale(scale)
      .setSize(b.width/scale,b.height/scale).setOffset(ART.feetX-b.width/scale/2,ART.feetY-b.height/scale)
      .setCollideWorldBounds(true).setPushable(false);
    this.behavior=new InsectFlight(navigation,start,identity);
    this.shadow=scene.add.image(start.x,start.y,'insect-shadow').setName('forest-insect-shadow')
      .setOrigin(this.originX,this.originY).setScale(scale);
    this.airborne=scene.add.image(start.x,start.y,'insect-fly','0').setName('forest-insect-airborne')
      .setOrigin(this.originX,this.originY).setScale(scale).setVisible(false);
    this.treeCollider=scene.physics.add.collider(this,obstacles);
    this.playerCollider=createDruidWolfCollider(scene,player,this);
    scene.cameras.getCamera('hud')?.ignore([this,this.shadow,this.airborne]);
  }
  setCollisionPeers(read:()=>readonly {x:number;y:number;width:number;height:number}[]) {
    this.behavior.navigator.setPeers(read);
  }
  takeDamage(amount:number,direction?:DamageDirection) {
    if(!this.projectileTargetable||!this.scene||!Number.isFinite(amount)||amount<=0)return false;
    this.actorState.health=Math.max(0,this.actorState.health-amount);
    this.behavior.alert();this.setVelocity(0,0);
    if(this.dying) {
      this.setAngle(0).clearTint();this.behavior.restoreFlight();this.hitElapsed=null;this.deathElapsed=0;(this.body as Phaser.Physics.Arcade.Body).enable=false;
      this.treeCollider?.destroy();this.playerCollider?.destroy();this.treeCollider=undefined;this.playerCollider=undefined;
      this.show('death',0);
    } else {
      const p=this.player.body as Phaser.Physics.Arcade.Body;
      const raw=direction??{x:this.x-p.center.x,y:this.y-p.bottom},length=Math.hypot(raw.x,raw.y);
      this.hitPush=length>.001&&Number.isFinite(length)?{x:raw.x/length,y:raw.y/length}:{x:this.facing==='left'?1:-1,y:0};
      this.hitElapsed=0;this.attackConnected=false;this.behavior.reactToHit();this.updateHitVisual(0);
    }
    return true;
  }
  updateBehavior(delta:number) {
    if(!this.active)return;
    let dt=Math.max(0,delta);
    if(this.dying) {
      this.deathElapsed+=dt;this.clearTint();
      this.show('death',this.frameAt('death',this.deathElapsed));
      return;
    }
    if(this.hitElapsed!==null) {
      const remaining=CONFIG.hitDurationMs-this.hitElapsed;this.hitElapsed+=dt;
      if(this.hitElapsed<CONFIG.hitDurationMs){this.updateHitVisual(dt);return;}
      this.hitElapsed=null;this.setAngle(0).clearTint().setVelocity(0,0);
      this.behavior.reactToHit();dt=Math.max(0,dt-remaining);
    }
    const p=this.player.body as Phaser.Physics.Arcade.Body,position={x:this.x,y:this.y};
    const before=this.actorState.phase;
    const velocity=this.behavior.step(dt,position,{x:p.center.x,y:p.bottom},this.player.wolfContactBounds);
    const phase=this.actorState.phase;
    if(phase==='attack'&&before!=='attack')this.face(p.center.x-this.x,p.bottom-this.y);
    else if(phase!=='attack'&&Math.hypot(velocity.x,velocity.y)>.01)this.face(velocity.x,velocity.y);
    this.setVelocity(velocity.x,velocity.y);
    if(phase!=='attack')this.attackConnected=false;
    else if(!this.attackConnected&&this.actorState.elapsed>=CONFIG.behavior.impactMs) {
      this.attackConnected=true;
      if(this.behavior.inAttackRange(position,this.player.wolfContactBounds))this.player.takeDamage(CONFIG.damage);
    }
    const animation:InsectAnimation=phase==='attack'?'attack':'fly';
    if(animation!==this.animation){this.animation=animation;this.clock=0;}
    const durations=insectDurations(animation),total=durations.reduce((a,b)=>a+b,0);
    if(phase==='attack')this.clock=Math.min(total-.001,this.actorState.elapsed/CONFIG.behavior.attackMs*total);
    else this.clock+=dt; // Flying wings also beat during each half-second hover.
    this.show(animation,this.frameAt(animation,phase==='attack'?this.clock:this.clock%total));
  }
  private updateHitVisual(delta:number) {
    const elapsed=this.hitElapsed??0,t=Math.min(1,elapsed/CONFIG.hitDurationMs);
    const speed=2*CONFIG.hitRecoil.distance/(CONFIG.hitDurationMs/1000)*(1-t);
    this.setVelocity(this.hitPush.x*speed,this.hitPush.y*speed);
    this.clock+=Math.max(0,delta);
    const total=insectDurations('fly').reduce((a,b)=>a+b,0);
    this.show('fly',this.frameAt('fly',this.clock%total));
    this.setAngle((this.hitPush.x-this.hitPush.y*.4)*CONFIG.hitRecoil.tiltDegrees*Math.sin(Math.PI*t));
    this.clearTint();
  }
  private frameAt(animation:InsectAnimation,elapsed:number) {
    const durations=insectDurations(animation);let index=0;
    while(index<durations.length-1&&elapsed>=durations[index])elapsed-=durations[index++];
    return index;
  }
  private face(dx:number,_dy:number) {
    if(Math.abs(dx)>.01)this.facing=dx<0?'left':'right';
  }
  private show(animation:InsectAnimation,frame:number) {
    const launching=this.behavior.launching,depth=launching?Math.max(this.y,this.behavior.launchDepth):this.y;
    // The source faces left; the entire same frame is mirrored for the right.
    this.animation=animation;this.setTexture(`insect-${animation}`,String(frame)).setDepth(depth).setFlipX(this.facing==='right').setVisible(!launching);
    this.airborne.setTexture(`insect-${animation}`,String(frame)).setFlipX(this.flipX)
      .setPosition(this.x,this.y-this.behavior.altitude).setDepth(depth).setVisible(launching);
    this.shadow.setPosition(this.x,this.y).setDepth(this.y-.1)
      .setVisible(!this.deathFinished).setAlpha(launching ? .5 : 1).setScale(CONFIG.appearance.scale*(launching ? .75 : 1));
  }
  snapshot():ForestInsectSave {
    return {x:this.x,y:this.y,state:{...this.actorState,target:{...this.actorState.target}},timers:this.behavior.snapshotTimers(),
      animation:this.animation,facing:this.facing,clock:this.clock,hitElapsed:this.hitElapsed,deathElapsed:this.deathElapsed,
      attackConnected:this.attackConnected,corpse:this.deathFinished,hitPush:{...this.hitPush},flight:this.behavior.snapshotFlight()};
  }
  restore(saved:ForestInsectSave) {
    Object.assign(this.actorState,saved.state,{target:{...saved.state.target}});this.behavior.restoreTimers(saved.timers);this.behavior.restoreFlight(saved.flight);
    const body=this.body as Phaser.Physics.Arcade.Body;body.reset(saved.x,saved.y);body.updateFromGameObject();
    body.prev.copy(body.position);body.prevFrame.copy(body.position);
    this.facing=saved.facing==='left'?'left':saved.facing==='right'?'right':saved.state.facingLeft?'left':'right';this.clock=saved.clock;this.hitElapsed=saved.hitElapsed;this.hitPush={...(saved.hitPush??{x:0,y:0})};
    this.deathElapsed=saved.deathElapsed;this.attackConnected=saved.attackConnected;
    if(this.dying){
      body.enable=false;this.treeCollider?.destroy();this.playerCollider?.destroy();
      this.treeCollider=undefined;this.playerCollider=undefined;
    }
    this.setAngle(0).clearTint();
    const animation:InsectAnimation=this.dying?'death':saved.animation.startsWith('attack')?'attack':'fly';
    this.show(animation,this.frameAt(animation,this.dying?this.deathElapsed:this.clock%insectDurations(animation).reduce((a,b)=>a+b,0)));
    if(this.hitElapsed!==null&&!this.dying)this.updateHitVisual(0);
  }
  override destroy(fromScene?:boolean) {
    if(!this.scene)return;
    this.treeCollider?.destroy();this.playerCollider?.destroy();this.shadow?.destroy();this.airborne?.destroy();super.destroy(fromScene);
  }
}
