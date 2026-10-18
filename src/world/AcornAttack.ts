import Phaser from 'phaser';
import { ACORN } from '../data/acorn';
import { AcornProjectile } from '../entities/AcornProjectile';
import type { Druid } from '../entities/Druid';
import { sweptRect, worldExit, type Point } from '../physics/projectileSweep';

interface Leaf {
  image: Phaser.GameObjects.Image; age: number; life: number;
  vx: number; vy: number; spin: number; scale: number;
}
type Body = Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody;

/** One provisional rightward spell; appearance, travel and damage are separate. */
export class AcornAttack {
  readonly shots: AcornProjectile[] = [];
  readonly leaves: Leaf[] = [];
  emittedCount = 0;
  private destroyed = false;

  constructor(private readonly scene: Phaser.Scene, private readonly player: Druid,
    private readonly random: () => number = Math.random) {}

  update(delta: number) {
    if(this.destroyed)return;
    const dt=Math.max(0,delta),facing=this.player.casting.consumeRelease();
    // Wolf hits run before this update, so a same-frame interruption wins.
    if(facing===ACORN.direction&&!this.player.hitReaction.active&&this.shots.length<ACORN.maxProjectiles) {
      const body=this.player.body as Phaser.Physics.Arcade.Body;
      this.shots.push(new AcornProjectile(this.scene,this.player,this.player.x+ACORN.spawnOffsetX,body.center.y));
      this.emittedCount++;
    }
    for(let i=this.shots.length-1;i>=0;i--) {
      const shot=this.shots[i];
      if(!shot.scene) {this.shots.splice(i,1);continue;}
      const body=shot.body as Phaser.Physics.Arcade.Body;
      const next={x:body.center.x,y:body.center.y};
      let impact=worldExit(shot.previous,next,this.scene.physics.world.bounds,ACORN.radius);
      const targets: Body[]=[...this.scene.physics.world.bodies.entries,...this.scene.physics.world.staticBodies.entries];
      for(const target of targets) {
        if(!target.enable||target===body||target.gameObject===this.player||target.checkCollision.none)continue;
        const t=sweptRect(shot.previous,next,target,ACORN.radius);
        if(t!==undefined&&(impact===undefined||t<impact))impact=t;
      }
      if(impact!==undefined||shot.ageMs+dt>=ACORN.lifetimeMs) {
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
      this.emitLeaf(x-8,y,-1);this.emitLeaf(x-8,y,1);
      shot.nextLeafDistance=this.between(ACORN.trail.spacingMin,ACORN.trail.spacingMax);
    }
    shot.nextLeafDistance-=length-travelled;
  }

  private emitLeaf(x: number, y: number, side: number) {
    if(this.leaves.length>=ACORN.trail.maxLeaves)this.leaves.shift()!.image.destroy();
    const config=ACORN.trail;
    const angle=Phaser.Math.DegToRad(this.between(config.angleDegrees-config.angleJitter,config.angleDegrees+config.angleJitter));
    // Inherit forward drift; relative to the faster nut the streams form a
    // shallow ±20-degree wake, while their sideways drift remains slow.
    const vx=ACORN.speed*config.carry;
    const vy=side*(ACORN.speed-vx)*Math.tan(angle);
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
