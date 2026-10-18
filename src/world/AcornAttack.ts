import Phaser from 'phaser';
import { ACORN } from '../data/acorn';
import { AcornProjectile } from '../entities/AcornProjectile';
import type { Druid } from '../entities/Druid';
import { projectileSpawn, sweptRect, worldExit, type Point } from '../physics/projectileSweep';
import { facingVector } from '../input/EightWayFacing';
import { isDamageable } from '../combat/Damageable';

interface Leaf {
  image: Phaser.GameObjects.Image; age: number; life: number;
  vx: number; vy: number; spin: number; scale: number;
}
type Body = Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody;

/** Eight-way spell; appearance, travel and damage are separate. */
export class AcornAttack {
  readonly shots: AcornProjectile[] = [];
  readonly leaves: Leaf[] = [];
  emittedCount = 0;
  private destroyed = false;

  constructor(private readonly scene: Phaser.Scene, private readonly player: Druid,
    private readonly random: () => number = Math.random,
    private readonly onFlight: (from: Point,to: Point) => void = () => {}) {}

  update(delta: number) {
    if(this.destroyed||this.player.dead)return;
    const dt=Math.max(0,delta),facing=this.player.casting.consumeRelease();
    // Wolf hits run before this update, so a same-frame interruption wins.
    if(facing&&!this.player.hitReaction.active&&this.shots.length<ACORN.maxProjectiles) {
      const body=this.player.body as Phaser.Physics.Arcade.Body;
      const direction=facingVector(facing);
      const spawn=projectileSpawn(body.center,this.player.wolfContactBounds,direction,ACORN.radius);
      this.shots.push(new AcornProjectile(this.scene,this.player,spawn.x,spawn.y,direction));
      this.emittedCount++;
    }
    for(let i=this.shots.length-1;i>=0;i--) {
      const shot=this.shots[i];
      if(!shot.scene) {this.shots.splice(i,1);continue;}
      const body=shot.body as Phaser.Physics.Arcade.Body;
      const next={x:body.center.x,y:body.center.y};
      let impact=worldExit(shot.previous,next,this.scene.physics.world.bounds,ACORN.radius);
      let hitBody: Body | undefined;
      const targets: Body[]=[...this.scene.physics.world.bodies.entries,...this.scene.physics.world.staticBodies.entries];
      for(const target of targets) {
        if(!target.enable||target===body||target.gameObject===this.player||target.checkCollision.none)continue;
        const t=sweptRect(shot.previous,next,target,ACORN.radius);
        if(t!==undefined&&(impact===undefined||t<impact)) {impact=t;hitBody=target;}
      }
      // Only the travelled segment up to the nearest impact can alert wolves.
      const t=impact??1;
      this.onFlight(shot.previous,{x:shot.previous.x+(next.x-shot.previous.x)*t,
        y:shot.previous.y+(next.y-shot.previous.y)*t});
      if(impact!==undefined||shot.ageMs+dt>=ACORN.lifetimeMs) {
        const target=hitBody?.gameObject;
        if(isDamageable(target))target.takeDamage(ACORN.damage);
        shot.destroy();this.shots.splice(i,1);continue;
      }
      this.emitTrail(shot,shot.previous,next);
      shot.previous=next;shot.updateVisual(dt);
    }
    for(let i=this.leaves.length-1;i>=0;i--) {
      const leaf=this.leaves[i];leaf.age+=dt;
      if(leaf.age>=leaf.life) {leaf.image.destroy();this.leaves.splice(i,1);continue;}
      const t=leaf.age/leaf.life;
      leaf.image.x+=leaf.vx*dt/1000;leaf.image.y+=leaf.vy*dt/1000;
      leaf.image.rotation+=leaf.spin*dt/1000;
      leaf.image.setAlpha(Math.min(1,leaf.age/50)*(1-t*t)*.95)
        .setScale(leaf.scale*(1-.3*t)).setDepth(leaf.image.y+ACORN.flightHeight+15);
    }
  }

  private emitTrail(shot: AcornProjectile, from: Point, to: Point) {
    const length=Math.hypot(to.x-from.x,to.y-from.y);
    let travelled=0;
    while(length-travelled>=shot.nextLeafDistance) {
      travelled+=shot.nextLeafDistance;
      const t=travelled/length;
      const x=from.x+(to.x-from.x)*t,y=from.y+(to.y-from.y)*t-ACORN.flightHeight;
      this.emitLeaf(x-shot.direction.x*8,y-shot.direction.y*8,shot.direction);
      shot.nextLeafDistance=this.between(ACORN.trail.spacingMin,ACORN.trail.spacingMax);
    }
    shot.nextLeafDistance-=length-travelled;
  }

  private emitLeaf(x: number, y: number, direction: Point) {
    if(this.leaves.length>=ACORN.trail.maxLeaves)this.leaves.shift()!.image.destroy();
    const config=ACORN.trail;
    // One narrow tail: each leaf has its own sideways drift, rather than a
    // mirrored partner. Rotate this local velocity with the shot direction.
    const forward=ACORN.speed*config.carry,sideways=this.between(-config.sidewaysSpeed,config.sidewaysSpeed);
    const vx=direction.x*forward-direction.y*sideways;
    const vy=direction.y*forward+direction.x*sideways;
    const image=this.scene.add.image(x+this.between(-3,2),y+this.between(-2,2),'acorn-leaves',String(Math.floor(this.random()*5)))
      .setName('acorn-leaf').setAlpha(0).setRotation(this.between(-Math.PI,Math.PI));
    this.scene.cameras.getCamera('hud')?.ignore(image);
    this.leaves.push({image,age:0,life:this.between(config.lifetimeMinMs,config.lifetimeMaxMs),vx,vy,
      spin:this.between(-1.1,1.1),scale:this.between(config.scaleMin,config.scaleMax)});
  }

  private between(min: number,max: number) {return min+this.random()*(max-min);}

  destroy() {
    if(this.destroyed)return;this.destroyed=true;
    this.shots.forEach(shot=>shot.destroy());this.leaves.forEach(leaf=>leaf.image.destroy());
    this.shots.length=0;this.leaves.length=0;
  }
}
