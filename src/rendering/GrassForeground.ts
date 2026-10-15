import Phaser from 'phaser';
import { FOREST_FLOOR, type FloorRaster } from '../world/forestFloor';
import { GRASS_COVERAGE, sampleGrassForeground } from '../world/grassCoverage';

/** One tiny overlay reuses the stationary grass already present beneath the boots. */
export class GrassForeground {
  private readonly key = 'grass-foreground';
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly image: Phaser.GameObjects.Image;
  private readonly pixels: ImageData;
  private lastX = NaN;
  private lastY = NaN;

  constructor(private scene: Phaser.Scene, private raster: FloorRaster) {
    const scale = FOREST_FLOOR.pixelScale;
    const width = Math.ceil(GRASS_COVERAGE.width / scale), height = Math.ceil(GRASS_COVERAGE.immersion / scale);
    this.texture = scene.textures.createCanvas(this.key, width, height)!;
    this.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.pixels = this.texture.context.createImageData(width, height);
    this.image = scene.add.image(0, 0, this.key).setOrigin(0).setScale(scale).setName('grass-foreground');
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  update(footX: number, footY: number, depth: number) {
    const scale = FOREST_FLOOR.pixelScale;
    const x = Math.floor(footX / scale), y = Math.floor(footY / scale);
    this.image.setDepth(depth + 0.01);
    if (x === this.lastX && y === this.lastY) return;
    this.lastX = x; this.lastY = y;
    const crop = sampleGrassForeground(this.raster, x, y, this.pixels.data, this.pixels.width, this.pixels.height);
    this.texture.context.putImageData(this.pixels, 0, 0);
    this.texture.refresh();
    this.image.setPosition(crop.left * scale, crop.top * scale).setVisible(crop.covered > 0)
      .setData({ coveredPixels: crop.covered, footX, footY });
  }

  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.image.destroy();
    this.scene.textures.remove(this.key);
  }
}
