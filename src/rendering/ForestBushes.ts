import Phaser from 'phaser';
import { BUSHES } from '../data/bushes';
import type { BushPlacement } from '../world/bushes';

/** Walk-through scenery stays above the floor and below all actors. */
export class ForestBushes {
  readonly foliage: Phaser.GameObjects.Image[] = [];
  constructor(scene: Phaser.Scene, readonly placements: readonly BushPlacement[]) {
    placements.forEach((bush, index) => {
      const a = BUSHES[bush.variant];
      this.foliage.push(scene.add.image(bush.x, bush.y, 'forest-bush-foliage', a.id)
        .setOrigin(a.anchorX / a.width, a.anchorY / a.height)
        .setScale(a.scale).setDepth(-2).setName(`bush-foliage-${index}`));
    });
  }
  rustle(index:number,progress?:number) {
    const image=this.foliage[index];if(!image?.scene)return;
    const order=[0,1,2,3,4,5,4,3,2,1];
    image.setFrame(progress===undefined?BUSHES[this.placements[index].variant].id:
      `rustle-${order[Math.min(order.length-1,Math.floor(progress*order.length))]}`);
  }
  destroy() {
    this.foliage.forEach(image => image.destroy());
    this.foliage.length = 0;
  }
}
