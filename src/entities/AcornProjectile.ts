import Phaser from 'phaser';
import { ACORN } from '../data/acorn';
import type { Druid } from './Druid';
import type { Point } from '../physics/projectileSweep';
import { AcornFlight } from '../behavior/AcornFlight';
import type { ProjectileSave } from '../persistence/snapshots';

/** Ground-plane physics plus a separate height arc approaching the range limit. */
export class AcornProjectile extends Phaser.Physics.Arcade.Image {
  readonly visual: Phaser.GameObjects.Image;
  readonly flight: AcornFlight;
  previous: Point;
  ageMs = 0;
  nextLeafDistance: number;

  constructor(scene: Phaser.Scene, readonly owner: Druid, x: number, y: number,
    readonly direction: Point, range = owner.actorState.range) {
    super(scene,x,y,'acorn');
    this.flight=new AcornFlight(direction,range);
    scene.add.existing(this);scene.physics.add.existing(this);
    this.setName('acorn-collider').setVisible(false).setCircle(ACORN.radius,24-ACORN.radius,24-ACORN.radius);
    const body=this.body as Phaser.Physics.Arcade.Body;body.allowGravity=false;body.reset(x,y);
    // reset() uses the full image's top-left; apply the circle's custom offset
    // now, since the first visual/collision check happens before the next step.
    body.updateFromGameObject();body.prev.copy(body.position);body.prevFrame.copy(body.position);
    this.setVelocity(direction.x*ACORN.speed,direction.y*ACORN.speed);
    this.visual=scene.add.image(x,y-ACORN.flightHeight,'acorn').setName('acorn-projectile')
      .setScale(ACORN.scale*.35).setAlpha(0).setDepth(y+15);
    this.previous={x,y};this.nextLeafDistance=8;
    scene.cameras.getCamera('hud')?.ignore([this,this.visual]);
  }

  updateVisual(delta: number) {
    this.ageMs+=Math.max(0,delta);
    const body=this.body as Phaser.Physics.Arcade.Body;
    const born=Math.min(1,this.ageMs/ACORN.birthMs),size=1-(1-born)**2;
    this.visual.setPosition(body.center.x,body.center.y-this.flight.height)
      .setScale(ACORN.scale*(.35+.65*size)).setAlpha(born)
      .setRotation(this.ageMs/1000*ACORN.spinRadiansPerSecond).setDepth(body.center.y+15);
  }

  override destroy(fromScene?: boolean) {
    if(!this.scene)return;
    if(this.body)(this.body as Phaser.Physics.Arcade.Body).enable=false;
    this.visual.destroy();super.destroy(fromScene);
  }

  snapshot(): ProjectileSave {
    const body = this.body as Phaser.Physics.Arcade.Body;
    return { x: body.center.x, y: body.center.y, direction: { ...this.direction },
      range: this.flight.maxDistance * Math.hypot(this.direction.x / ACORN.rangeX, this.direction.y / ACORN.rangeY),
      distance: this.flight.distance, ageMs: this.ageMs, nextLeafDistance: this.nextLeafDistance };
  }

  restore(saved: ProjectileSave) {
    this.flight.distance = saved.distance; this.ageMs = saved.ageMs;
    this.nextLeafDistance = saved.nextLeafDistance; this.updateVisual(0);
  }
}
