import Phaser from 'phaser';
import { FOREST_INSECT as CONFIG } from '../data/forestInsect';
import { WolfBehavior } from '../behavior/WolfBehavior';
import type { WolfNavigation, WolfPoint } from '../world/WolfNavigation';
import { createDruidWolfCollider } from '../physics/wolfContact';
import { INSECT_METRICS as ART, insectDurations, type InsectAnimation, type InsectDirection } from '../rendering/forestInsectArt';
import type { Druid } from './Druid';
import type { Damageable } from '../combat/Damageable';
import type { ForestInsectSave } from '../persistence/snapshots';

/** Flight, four-direction tail strikes, hit pause and persistent fallen body. */
export class ForestInsect extends Phaser.Physics.Arcade.Sprite implements Damageable {
  readonly behavior:WolfBehavior;
  readonly shadow:Phaser.GameObjects.Image;
  get actorState(){return this.behavior.actorState;}
  get dying(){return this.actorState.health<=0;}
  get deathFinished(){return this.dying&&this.deathElapsed>=CONFIG.deathDurationMs;}
  private animation:InsectAnimation='idle';
  private facing:InsectDirection='right';
  private clock=0;
  private attackConnected=false;
  private hitElapsed:number|null=null;
  private deathElapsed=0;
  private previous:WolfPoint;
  private treeCollider?:Phaser.Physics.Arcade.Collider;
  private playerCollider?:Phaser.Physics.Arcade.Collider;

  constructor(scene:Phaser.Scene,navigation:WolfNavigation,obstacles:Phaser.Physics.Arcade.StaticGroup,
    private readonly player:Druid,start:WolfPoint,identity:number) {
    super(scene,start.x,start.y,'insect-idle','0');scene.add.existing(this);scene.physics.add.existing(this);
    const scale=CONFIG.appearance.scale,b=CONFIG.body;
    this.setName('forest-insect').setOrigin(ART.feetX/ART.width,ART.feetY/ART.height).setScale(scale)
      .setSize(b.width/scale,b.height/scale).setOffset(ART.feetX-b.width/scale/2,ART.feetY-b.height/scale)
      .setCollideWorldBounds(true).setPushable(false);
    this.behavior=new WolfBehavior(navigation,start,identity,CONFIG);this.previous={...start};
    this.shadow=scene.add.image(start.x,start.y,'insect-shadow').setName('forest-insect-shadow')
      .setOrigin(this.originX,this.originY).setScale(scale);
    this.treeCollider=scene.physics.add.collider(this,obstacles);
    this.playerCollider=createDruidWolfCollider(scene,player,this);
    scene.cameras.getCamera('hud')?.ignore([this,this.shadow]);
  }
  takeDamage(amount:number) {
    if(this.dying||!this.scene||!Number.isFinite(amount)||amount<=0)return false;
    this.actorState.health=Math.max(0,this.actorState.health-amount);
    this.behavior.alert();this.setVelocity(0,0);this.previous={x:this.x,y:this.y};
    if(this.dying) {
      this.hitElapsed=null;this.deathElapsed=0;(this.body as Phaser.Physics.Arcade.Body).enable=false;
      this.treeCollider?.destroy();this.playerCollider?.destroy();this.treeCollider=undefined;this.playerCollider=undefined;
      this.show('death',0);
    } else {this.hitElapsed=0;this.setTint(0xd9efbe);}
    return true;
  }
  updateBehavior(delta:number) {
    if(!this.active)return;
    let dt=Math.max(0,delta);
    if(this.dying) {
      this.deathElapsed+=dt;this.clearTint();
      this.show('death',Math.min(5,Math.floor(this.deathElapsed/100)));
      return;
    }
    if(this.hitElapsed!==null) {
      const remaining=CONFIG.hitDurationMs-this.hitElapsed;this.hitElapsed+=dt;
      this.previous={x:this.x,y:this.y};this.setVelocity(0,0);
      if(this.hitElapsed<CONFIG.hitDurationMs)return;
      this.hitElapsed=null;this.clearTint();dt=Math.max(0,dt-remaining);
    }
    const p=this.player.body as Phaser.Physics.Arcade.Body,position={x:this.x,y:this.y};
    const travelled=Math.hypot(this.x-this.previous.x,this.y-this.previous.y);this.previous=position;
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
    const moving=travelled>.01;
    const animation:InsectAnimation=phase==='attack'?`attack-${this.facing}`:
      moving?(phase==='chase'?'run':'walk'):
      this.facing==='up'||this.facing==='down'?`idle-${this.facing}`:'idle';
    if(animation!==this.animation){this.animation=animation;this.clock=0;}
    const durations=insectDurations(animation),total=durations.reduce((a,b)=>a+b,0);
    if(phase==='attack')this.clock=Math.min(total-.001,this.actorState.elapsed/CONFIG.behavior.attackMs*total);
    else this.clock+=moving?travelled/CONFIG.appearance.referenceSpeed*1000:dt;
    let elapsed=phase==='attack'?this.clock:this.clock%total,index=0;
    while(index<durations.length-1&&elapsed>=durations[index])elapsed-=durations[index++];
    this.show(animation,index);
  }
  private face(dx:number,dy:number) {
    this.facing=Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down';
  }
  private show(animation:InsectAnimation,frame:number) {
    this.animation=animation;this.setTexture(`insect-${animation}`,String(frame)).setDepth(this.y);
    this.setFlipX((animation==='idle'||animation==='walk'||animation==='run'||animation==='death')&&this.facing==='left');
    this.shadow.setPosition(this.x,this.y).setDepth(this.y-.1);
  }
  snapshot():ForestInsectSave {
    return {x:this.x,y:this.y,state:{...this.actorState,target:{...this.actorState.target}},timers:this.behavior.snapshotTimers(),
      animation:this.animation,facing:this.facing,clock:this.clock,hitElapsed:this.hitElapsed,deathElapsed:this.deathElapsed,
      attackConnected:this.attackConnected,corpse:this.deathFinished};
  }
  restore(saved:ForestInsectSave) {
    Object.assign(this.actorState,saved.state,{target:{...saved.state.target}});this.behavior.restoreTimers(saved.timers);
    const body=this.body as Phaser.Physics.Arcade.Body;body.reset(saved.x,saved.y);body.updateFromGameObject();
    body.prev.copy(body.position);body.prevFrame.copy(body.position);this.previous={x:saved.x,y:saved.y};
    this.facing=saved.facing;this.clock=saved.clock;this.hitElapsed=saved.hitElapsed;
    this.deathElapsed=saved.deathElapsed;this.attackConnected=saved.attackConnected;
    if(this.dying){
      body.enable=false;this.treeCollider?.destroy();this.playerCollider?.destroy();
      this.treeCollider=undefined;this.playerCollider=undefined;
    }
    if(this.hitElapsed!==null)this.setTint(0xd9efbe);
    this.show(saved.animation,this.dying?Math.min(5,Math.floor(this.deathElapsed/100)):0);
  }
  override destroy(fromScene?:boolean) {
    if(!this.scene)return;
    this.treeCollider?.destroy();this.playerCollider?.destroy();this.shadow?.destroy();super.destroy(fromScene);
  }
}
