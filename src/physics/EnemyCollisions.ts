import Phaser from 'phaser';
import type { Rect } from '../world/geometry';

type EnemyBody = Phaser.Physics.Arcade.Sprite & {readonly dying:boolean;setCollisionPeers?:(read:()=>readonly Rect[])=>void};

/** One shared collision group for every enemy species, including later spawns. */
export class EnemyCollisions {
  readonly group:Phaser.Physics.Arcade.Group;
  private readonly collider:Phaser.Physics.Arcade.Collider;

  constructor(scene:Phaser.Scene) {
    this.group=scene.physics.add.group({runChildUpdate:false});
    // Register existing custom bodies without resetting bounds, speeds or
    // re-enabling a restored corpse. Phaser explicitly supports empty defaults.
    this.group.defaults={} as typeof this.group.defaults;
    this.collider=scene.physics.add.collider(this.group,this.group,undefined,(first,second)=>{
      const a=first as EnemyBody,b=second as EnemyBody;
      return a!==b&&a.active&&b.active&&!a.dying&&!b.dying&&!!a.body?.enable&&!!b.body?.enable;
    }).setName('enemy-enemy');
  }

  add(enemy:EnemyBody){
    this.group.add(enemy);
    enemy.setCollisionPeers?.(()=>this.group.getChildren().flatMap(child=>{
      const other=child as EnemyBody,body=other.body;
      return other!==enemy&&other.active&&!other.dying&&body?.enable?
        [{x:body.x,y:body.y,width:body.width,height:body.height}]:[];
    }));
  }
  destroy() {
    if(this.collider.world)this.collider.destroy();
    this.group.destroy(false);
  }
}
