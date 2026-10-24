import Phaser from 'phaser';
import { BUSHES } from '../data/bushes';
import { bushVisualRect, type BushPlacement } from '../world/bushes';
import { overlaps, type Rect } from '../world/geometry';

/** Walk-through foliage occludes the entire druid; ground swatches stay underneath. */
export class ForestBushes {
  readonly foliage: Phaser.GameObjects.Image[] = [];
  readonly ground: Phaser.GameObjects.Image[] = [];
  constructor(scene: Phaser.Scene, readonly placements: readonly BushPlacement[]) {
    placements.forEach((bush, index) => {
      const a = BUSHES[bush.variant];
      for (const [texture, target, depth] of [
        ['forest-bush-ground', this.ground, -1], ['forest-bush-foliage', this.foliage, bush.y],
      ] as const) {
        target.push(scene.add.image(bush.x, bush.y, texture, a.id).setOrigin(a.anchorX / a.width, a.anchorY / a.height)
          .setScale(a.scale).setDepth(depth).setName(`bush-${texture.endsWith('ground') ? 'ground' : 'foliage'}-${index}`));
      }
    });
  }
  update(playerBounds: Rect, playerDepth: number) {
    this.placements.forEach((bush, index) => {
      this.foliage[index].setDepth(overlaps(playerBounds, bushVisualRect(bush)) ? Math.max(bush.y, playerDepth + 1) : bush.y);
    });
  }
  destroy() {
    [...this.foliage, ...this.ground].forEach(image => image.destroy());
    this.foliage.length = this.ground.length = 0;
  }
}
