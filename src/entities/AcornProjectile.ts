import Phaser from 'phaser';
import { ACORN } from '../data/acorn';
import type { Druid } from './Druid';
import type { Point } from '../physics/projectileSweep';

/** Physics travels on the ground plane; its separate visual stays at chest height. */
export class AcornProjectile extends Phaser.Physics.Arcade.Image {
  readonly visual: Phaser.GameObjects.Image;
  previous: Point;
  ageMs = 0;
  nextLeafDistance: number;

  constructor(scene: Phaser.Scene, readonly owner: Druid, x: number, y: number,
    readonly direction: Point) {
    super(scene,x,y,'acorn');
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
    this.visual.setPosition(body.center.x,body.center.y-ACORN.flightHeight)
      .setScale(ACORN.scale*(.35+.65*size)).setAlpha(born)
      .setRotation(this.ageMs/1000*ACORN.spinRadiansPerSecond).setDepth(body.center.y+15);
  }

  override destroy(fromScene?: boolean) {
    if(!this.scene)return;
    if(this.body)(this.body as Phaser.Physics.Arcade.Body).enable=false;
    this.visual.destroy();super.destroy(fromScene);
  }
}
