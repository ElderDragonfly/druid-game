import Phaser from 'phaser';
import { BEAR } from '../data/bear';
import { BearBehavior } from '../behavior/BearBehavior';
import { BEAR_METRICS as ART,bearDuration,bearFrame,type BearAnimation } from '../rendering/bearArt';
import { WolfNavigation,type WolfPoint } from '../world/WolfNavigation';
import { createDruidWolfCollider } from '../physics/wolfContact';
import type { Rect } from '../world/geometry';
import type { Druid } from './Druid';
import type { Damageable } from '../combat/Damageable';
import type { BearSave } from '../persistence/snapshots';
export class Bear extends Phaser.Physics.Arcade.Sprite implements Damageable {
 readonly definition=BEAR;
 readonly behavior:BearBehavior;
 readonly shadow:Phaser.GameObjects.Ellipse;
 get actorState(){return this.behavior.actorState;}
 get dying(){return this.actorState.health<=0;}
 private treeCollider?:Phaser.Physics.Arcade.Collider;
 private playerCollider?:Phaser.Physics.Arcade.Collider;
 private animation:BearAnimation='sleep';
 private clock=0;
 private hitElapsed:number|null=null;
 private previous:WolfPoint;
 constructor(scene:Phaser.Scene,layout:WolfNavigation['layout'],obstacles:Phaser.Physics.Arcade.StaticGroup,
  private player:Druid,start:WolfPoint){
  super(scene,start.x,start.y,'bear-sleep-left','0');scene.add.existing(this);scene.physics.add.existing(this);
  const scale=BEAR.appearance.scale,b=BEAR.body;
  this.setName('bear').setOrigin(ART.feetX/ART.width,ART.feetY/ART.height).setScale(scale)
   .setSize(b.width/scale,b.height/scale).setOffset(ART.feetX-b.width/scale/2,ART.feetY-b.height/scale)
   .setPushable(false).setCollideWorldBounds(true);
  this.behavior=new BearBehavior(new WolfNavigation(layout,BEAR.body));this.previous={...start};
  this.shadow=scene.add.ellipse(start.x,start.y-3,112,22,0x102418,.3).setName('bear-shadow').setDepth(start.y-.1);
  this.treeCollider=scene.physics.add.collider(this,obstacles);this.playerCollider=createDruidWolfCollider(scene,player,this);
  scene.cameras.getCamera('hud')?.ignore([this,this.shadow]);
 }
 setCollisionPeers(read:()=>readonly Rect[]){this.behavior.navigator.setPeers(read);}
 takeDamage(amount:number){
  if(this.dying||!this.scene||!Number.isFinite(amount)||amount<=0)return false;
  this.actorState.health=Math.max(0,this.actorState.health-amount);this.setVelocity(0,0);this.previous={x:this.x,y:this.y};
  if(this.dying){
   this.actorState.phase='dead';this.actorState.elapsed=0;this.hitElapsed=null;this.setAngle(0);
   (this.body as Phaser.Physics.Arcade.Body).enable=false;this.removeColliders();this.show('sleep',0);this.setTint(0x68715f);
  }else {this.behavior.reactToHit();this.hitElapsed=0;}
  return true;
 }
 updateBehavior(delta:number){
  if(!this.active||this.dying||!this.body?.enable)return;
  let dt=Math.max(0,delta);const s=this.actorState;
  if(this.hitElapsed!==null){
   const remaining=BEAR.hitMs-this.hitElapsed;this.hitElapsed+=dt;this.setVelocity(0,0);this.previous={x:this.x,y:this.y};
   if(this.hitElapsed<BEAR.hitMs){this.show(s.phase==='wake'?'wake':'walk',0);this.setAngle(4*Math.sin(Math.PI*this.hitElapsed/BEAR.hitMs));return;}
   this.hitElapsed=null;this.setAngle(0);dt=Math.max(0,dt-remaining);this.behavior.navigator.invalidate();
  }
  const body=this.player.body as Phaser.Physics.Arcade.Body,position={x:this.x,y:this.y};
  const distance=Math.hypot(this.x-this.previous.x,this.y-this.previous.y);this.previous=position;
  const velocity=this.behavior.step(dt,position,{x:body.center.x,y:body.bottom},this.player.wolfContactBounds);
  this.setVelocity(velocity.x,velocity.y);
  if(this.behavior.impactReady&&this.behavior.inAttackRange(position,this.player.wolfContactBounds))this.player.takeDamage(BEAR.damage);
  const animation:BearAnimation=s.phase==='sleep'?'sleep':s.phase==='wake'?'wake':s.phase==='attack'?s.attack:
   distance>.01&&Math.hypot(velocity.x,velocity.y)>.01?(s.phase==='run'?'run':'walk'):'walk';
  if(animation!==this.animation){this.animation=animation;this.clock=0;}
  let elapsed=0;
  if(s.phase==='attack'||s.phase==='wake')elapsed=Math.min(bearDuration(animation)-.001,s.elapsed);
  else if(s.phase==='sleep'){this.clock+=dt;elapsed=this.clock%bearDuration('sleep');}
  else if(distance>.01&&Math.hypot(velocity.x,velocity.y)>.01){
   const reference=animation==='run'?BEAR.appearance.runReferenceSpeed:BEAR.appearance.walkReferenceSpeed;
   this.clock+=distance/reference*1000;elapsed=this.clock%bearDuration(animation);
  }else this.clock=0;
  this.show(animation,bearFrame(animation,elapsed));
 }
 private show(animation:BearAnimation,frame:number){
  this.animation=animation;this.setTexture(`bear-${animation}-${this.actorState.facingLeft?'left':'right'}`,String(frame)).setDepth(this.y);
  this.shadow.setPosition(this.x,this.y-3).setDepth(this.y-.1);
 }
 snapshot():BearSave{return {x:this.x,y:this.y,state:{...this.actorState},animation:this.animation,clock:this.clock,hitElapsed:this.hitElapsed};}
 restore(saved:BearSave){
  Object.assign(this.actorState,saved.state);
  // Saves from the timed-pursuit version have no rage flag. Resume them calmly,
  // carrying any old speed modifier over to the new base run speed.
  if(saved.state.enraged===undefined){
   this.actorState.enraged=false;
   this.actorState.runSpeed=saved.state.runSpeed/BEAR.appearance.runReferenceSpeed*BEAR.stats.runSpeed;
  }
  const body=this.body as Phaser.Physics.Arcade.Body;
  body.reset(saved.x,saved.y);body.updateFromGameObject();body.prev.copy(body.position);body.prevFrame.copy(body.position);
  this.previous={x:saved.x,y:saved.y};this.clock=saved.clock;this.hitElapsed=saved.hitElapsed;this.behavior.navigator.invalidate();
  const animation=this.dying?'sleep':saved.animation;
  const elapsed=this.dying?0:this.actorState.phase==='wake'||this.actorState.phase==='attack'?this.actorState.elapsed:this.clock%bearDuration(animation);
  this.show(animation,bearFrame(animation,elapsed));
  if(this.dying){body.enable=false;this.removeColliders();this.setTint(0x68715f);}
  else if(this.hitElapsed!==null)this.setAngle(4*Math.sin(Math.PI*this.hitElapsed/BEAR.hitMs));
 }
 private removeColliders(){this.treeCollider?.destroy();this.playerCollider?.destroy();this.treeCollider=undefined;this.playerCollider=undefined;}
 override destroy(fromScene?:boolean){if(!this.scene)return;this.removeColliders();this.shadow?.destroy();super.destroy(fromScene);}
}
