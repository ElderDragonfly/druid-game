import Phaser from 'phaser';
import { FOREST_FLOOR, generateForestFloor, type FloorRaster } from '../world/forestFloor';
import type { MeadowLayout } from '../world/meadowLayout';
import { applySkeletonClearing } from './skeletonClearing';

const samples = new WeakMap<object, FloorRaster>();

export function forestFloorSamples(scene: Phaser.Scene): FloorRaster[] {
  return [{ ...forestFloorSample(scene.textures.get('forest-floor-source').getSourceImage() as CanvasImageSource,
    scene.textures.get('forest-grass-coverage').getSourceImage() as CanvasImageSource),
    id: 'grass', weight: 1 }];
}

export function forestFloorSample(image: CanvasImageSource, coverage: CanvasImageSource): FloorRaster {
  const cached = samples.get(image);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = FOREST_FLOOR.sampleSize;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(coverage, 0, 0, canvas.width, canvas.height);
  const mask = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const grassHeights = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < grassHeights.length; i++) grassHeights[i] = mask[i * 4];
  const sample = { width: canvas.width, height: canvas.height, pixels, grassHeights };
  samples.set(image, sample);
  return sample;
}

export function drawForestFloor(scene: Phaser.Scene, layout: MeadowLayout) {
  const sample = forestFloorSamples(scene);
  const w = Math.ceil(layout.width / FOREST_FLOOR.pixelScale), h = Math.ceil(layout.height / FOREST_FLOOR.pixelScale);
  const raster = generateForestFloor(sample, w, h, layout.seed);
  applySkeletonClearing(raster,layout);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(w, h); image.data.set(raster.pixels); context.putImageData(image, 0, 0);
  const key = '_forest-floor-stamp';
  scene.textures.addCanvas(key, canvas)!.setFilter(Phaser.Textures.FilterMode.NEAREST);
  const stamp = scene.make.image({ key, add: false }).setOrigin(0);
  const floor = scene.add.renderTexture(layout.width / 2, layout.height / 2, w, h)
    .draw(stamp).setDisplaySize(layout.width, layout.height).setDepth(-1000).setName('forest-floor')
    .setData({ seed: layout.seed, sourceTexture: 'forest-floor-source', patchCount: raster.patchCount, sourceCounts: raster.sourceCounts });
  floor.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  stamp.destroy();
  scene.textures.remove(key);
  return { floor, raster };
}
