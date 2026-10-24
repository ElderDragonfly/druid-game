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
  destroy() {
    this.foliage.forEach(image => image.destroy());
    this.foliage.length = 0;
  }
}
