import Phaser from 'phaser';
import { SKELETON as DEFINITION } from '../data/skeleton';
import { WolfBehavior } from '../behavior/WolfBehavior';
import { EnemyNavigator } from '../world/EnemyNavigator';
import { WolfNavigation,type WolfPoint } from '../world/WolfNavigation';
import { SKELETON_METRICS as ART,skeletonDurations,type SkeletonAnimation } from '../rendering/skeletonArt';
import { createDruidWolfCollider } from '../physics/wolfContact';
import type { Rect } from '../world/geometry';
import type { Damageable } from '../combat/Damageable';
import type { WolfSave } from '../persistence/snapshots';
import type { Druid } from './Druid';

class SkeletonBehavior extends WolfBehavior {
  readonly navigator:EnemyNavigator;
  constructor(navigation:WolfNavigation,start:WolfPoint,identity:number){
    super(navigation,start,identity,DEFINITION);
    this.navigator=new EnemyNavigator(navigation,DEFINITION.body);
  }
  protected override follow(position:WolfPoint,goal:WolfPoint,speed:number,delta:number){
    const v=this.navigator.velocity(position,goal,speed,delta);
    if(Math.abs(v.x)>1)this.actorState.facingLeft=v.x<0;
    return v;
  }
}

/** Original GIF poses; movement, impact and persistence remain independent. */
export class Skeleton extends Phaser.Physics.Arcade.Sprite implements Damageable {
  readonly definition=DEFINITION;
  readonly behavior:SkeletonBehavior;
  readonly shadow:Phaser.GameObjects.Ellipse;
  get actorState(){return this.behavior.actorState;}
  get dying(){return this.actorState.health<=0;}
  get reactingToHit(){return this.hitElapsed!==null;}
  private treeCollider?:Phaser.Physics.Arcade.Collider;
  private playerCollider?:Phaser.Physics.Arcade.Collider;
  private previous:WolfPoint;
  private animation:SkeletonAnimation='idle';
  private clock=0;
  private hitElapsed:number|null=null;
  private deathElapsed=0;
  private attackConnected=false;

  constructor(scene:Phaser.Scene,navigation:WolfNavigation,trees:Phaser.Physics.Arcade.StaticGroup,
    private player:Druid,start:WolfPoint,identity:number){
    super(scene,start.x,start.y,'skeleton-idle','0');
    scene.add.existing(this);scene.physics.add.existing(this);
    const scale=DEFINITION.appearance.scale,b=DEFINITION.body;
    this.setName('skeleton').setOrigin(ART.feetX/ART.width,ART.feetY/ART.height).setScale(scale)
      .setSize(b.width/scale,b.height/scale)
      .setOffset(ART.feetX-b.width/scale/2,ART.feetY-b.height/scale)
      .setCollideWorldBounds(true).setPushable(false);
    this.behavior=new SkeletonBehavior(navigation,start,identity);
    this.previous={...start};
    this.shadow=scene.add.ellipse(start.x,start.y-3,32,9,0x102218,.25).setName('skeleton-shadow');
    this.treeCollider=scene.physics.add.collider(this,trees);
    this.playerCollider=createDruidWolfCollider(scene,player,this);
    scene.cameras.getCamera('hud')?.ignore([this,this.shadow]);
    this.showFrame();
  }
  setCollisionPeers(read:()=>readonly Rect[]){this.behavior.navigator.setPeers(read);}
  takeDamage(amount:number){
    if(this.dying||!this.scene||!Number.isFinite(amount)||amount<=0)return false;
    this.actorState.health=Math.max(0,this.actorState.health-amount);
    this.behavior.alert();this.setVelocity(0,0);
    this.previous={x:this.x,y:this.y};this.attackConnected=false;
    // A hit interrupts the wind-up rather than storing a delayed impact.
    this.actorState.phase='chase';this.actorState.elapsed=0;
    if(this.dying){
      this.hitElapsed=null;this.deathElapsed=0;
      (this.body as Phaser.Physics.Arcade.Body).enable=false;
      this.treeCollider?.destroy();this.playerCollider?.destroy();
      this.treeCollider=undefined;this.playerCollider=undefined;
    }else this.hitElapsed=0;
    this.animation='idle';this.clock=0;this.showFrame();
    return true;
  }
  updateBehavior(delta:number){
    if(!this.active)return;
    const dt=Math.max(0,delta),body=this.body as Phaser.Physics.Arcade.Body;
    if(this.dying){
      // No death sequence exists in the supplied GIF: a short fade is temporary.
      this.deathElapsed=Math.min(300,this.deathElapsed+dt);
      this.setAlpha(1-this.deathElapsed/300);this.shadow.setAlpha((1-this.deathElapsed/300)*.25);
      if(this.deathElapsed>=300){this.setVisible(false).setActive(false);this.shadow.setVisible(false);}
      return;
    }
    if(!body.enable)return;
    if(this.hitElapsed!==null){
      this.hitElapsed+=dt;this.setVelocity(0,0);this.previous={x:this.x,y:this.y};
      this.setAngle(-Math.sin(Math.min(1,this.hitElapsed/260)*Math.PI)*7*(this.flipX?-1:1));
      if(this.hitElapsed<260)return;
      this.hitElapsed=null;this.setAngle(0);this.behavior.navigator.invalidate();
    }
    const position={x:this.x,y:this.y},distance=Math.hypot(this.x-this.previous.x,this.y-this.previous.y);
    this.previous=position;
    const p=this.player.body as Phaser.Physics.Arcade.Body;
    const velocity=this.behavior.step(dt,position,{x:p.center.x,y:p.bottom},this.player.wolfContactBounds);
    this.setVelocity(velocity.x,velocity.y).setFlipX(this.actorState.facingLeft).setDepth(this.y);
    const attacking=this.actorState.phase==='attack';
    if(!attacking)this.attackConnected=false;
    else if(!this.attackConnected&&this.actorState.elapsed>=DEFINITION.behavior.impactMs){
      this.attackConnected=true;
      if(this.behavior.inAttackRange(position,this.player.wolfContactBounds))this.player.takeDamage(DEFINITION.damage);
    }
    const moving=distance>.01&&distance<Math.max(30,this.actorState.runSpeed*dt/1000*3);
    const animation:SkeletonAnimation=attacking?'attack':moving?'walk':'idle';
    if(animation!==this.animation){this.animation=animation;this.clock=0;}
    const total=skeletonDurations(animation).reduce((a,b)=>a+b,0);
    if(attacking)this.clock=Math.min(total-.001,this.actorState.elapsed/DEFINITION.behavior.attackMs*total);
    else this.clock+=moving?distance/DEFINITION.appearance.walkReferenceSpeed*1000:dt;
    this.showFrame();
  }
  private showFrame(){
    const durations=skeletonDurations(this.animation),total=durations.reduce((a,b)=>a+b,0);
    let t=this.clock%total,i=0;
    while(i<durations.length-1&&t>=durations[i])t-=durations[i++];
    this.setTexture(`skeleton-${this.animation}`,String(i)).setDepth(this.y);
    this.shadow.setPosition(this.x,this.y-3).setDepth(this.y-.1);
  }
  snapshot():WolfSave{
    return {x:this.x,y:this.y,state:{...this.actorState,target:{...this.actorState.target}},
      timers:this.behavior.snapshotTimers(),animation:this.animation==='attack'?'attack-down':this.animation,
      clock:this.clock,hitElapsed:this.hitElapsed,deathElapsed:this.deathElapsed,
      attackConnected:this.attackConnected,corpse:this.dying};
  }
  restore(saved:WolfSave){
    if(saved.state.health===0)this.takeDamage(this.actorState.health);
    Object.assign(this.actorState,saved.state,{target:{...saved.state.target}});
    this.behavior.restoreTimers(saved.timers);this.behavior.navigator.invalidate();
    const body=this.body as Phaser.Physics.Arcade.Body;
    body.reset(saved.x,saved.y);body.updateFromGameObject();
    this.previous={x:saved.x,y:saved.y};
    this.animation=saved.animation==='attack-down'?'attack':saved.animation==='walk'?'walk':'idle';
    this.clock=saved.clock;this.hitElapsed=saved.hitElapsed;this.deathElapsed=saved.deathElapsed;
    this.attackConnected=saved.attackConnected;this.setFlipX(saved.state.facingLeft);this.showFrame();
    if(this.dying)this.updateBehavior(0);
  }
  override destroy(fromScene?:boolean){
    if(!this.scene)return;
    this.treeCollider?.destroy();this.playerCollider?.destroy();this.shadow?.destroy();
    super.destroy(fromScene);
  }
}
