import Phaser from 'phaser';
import { BUSHES } from '../data/bushes';
import { bushVisualRect, type BushPlacement } from '../world/bushes';
import { overlaps, type Rect } from '../world/geometry';

/** Foliage-only bushes occlude the entire druid; there are no ground swatches. */
export class ForestBushes {
  readonly foliage: Phaser.GameObjects.Image[] = [];
  constructor(scene: Phaser.Scene, readonly placements: readonly BushPlacement[]) {
    placements.forEach((bush, index) => {
      const a = BUSHES[bush.variant];
      this.foliage.push(scene.add.image(bush.x, bush.y, 'forest-bush-foliage', a.id)
        .setOrigin(a.anchorX / a.width, a.anchorY / a.height)
        .setScale(a.scale).setDepth(bush.y).setName(`bush-foliage-${index}`));
    });
  }
  update(playerBounds: Rect, playerDepth: number) {
    this.placements.forEach((bush, index) => {
      this.foliage[index].setDepth(overlaps(playerBounds, bushVisualRect(bush)) ? Math.max(bush.y, playerDepth + 1) : bush.y);
    });
  }
  destroy() {
    this.foliage.forEach(image => image.destroy());
    this.foliage.length = 0;
  }
}
