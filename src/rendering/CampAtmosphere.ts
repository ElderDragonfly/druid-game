import Phaser from 'phaser';
import fireUrl from '../../docs/art/selection-camp-uploaded-flame-v1/flame-only-frames.png';
import waterUrl from '../../docs/art/selection-camp-seam-v1/water-overlay-frames.png';
import cleanUrl from '../../docs/art/selection-camp-atmosphere-v1/firefly-clean-patches.png';
import { CAMP_ATMOSPHERE as CONFIG, fireflyPosition } from '../data/campAtmosphere';

export const CAMP_ATMOSPHERE_ART = [
  { key: 'camp-fire-drawn-source', url: fireUrl }, { key: 'camp-water-drawn-source', url: waterUrl }, { key: 'camp-firefly-clean', url: cleanUrl },
];
const FIRE_KEY = 'selection-fire-frames', WATER_KEY = 'selection-water-frames', FLY_KEY = 'selection-firefly';
/** Transparent effects only: never redraw a rectangular piece of scenery over
 * the shared backdrop. This also avoids WebGL seams at fractional camera zoom. */
export class CampAtmosphere {
  readonly fire: Phaser.GameObjects.Image;
  readonly water: Phaser.GameObjects.Image;
  readonly fireflies: Phaser.GameObjects.Image[];
  private readonly clean: Phaser.GameObjects.Image;
  private elapsedMs = 0;
  private lastFireFrame = -1;
  private lastWaterFrame = -1;
  private destroyed = false;

  constructor(private readonly scene: Phaser.Scene) {
    for (const art of CAMP_ATMOSPHERE_ART) scene.textures.get(art.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.registerFrames(FIRE_KEY, 'camp-fire-drawn-source', CONFIG.fire);
    this.registerFrames(WATER_KEY, 'camp-water-drawn-source', CONFIG.water);
    this.prepareFirefly();
    const image = (key: string, area: typeof CONFIG.fire | typeof CONFIG.water, name: string) =>
      scene.add.image(area.x, CONFIG.menuTop + area.y, key, '0').setOrigin(0).setName(name);
    this.water = image(WATER_KEY, CONFIG.water, 'camp-water');
    this.fire = image(FIRE_KEY, CONFIG.fire, 'camp-fire');
    this.clean = scene.add.image(0, CONFIG.menuTop, 'camp-firefly-clean').setOrigin(0).setName('camp-firefly-clean-layer');
    this.fireflies = CONFIG.fireflies.map((_, index) => scene.add.image(0, 0, FLY_KEY)
      .setName(`camp-firefly-${index}`).setData('flightPeriodMs', CONFIG.fireflies[index].periodMs));
    this.update(0, 0);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  private update(_time: number, delta: number) {
    this.elapsedMs += Math.max(0, delta);
    const fire = Math.floor(this.elapsedMs / 1000 * CONFIG.fire.fps) % CONFIG.fire.frameCount;
    const water = Math.floor(this.elapsedMs / 1000 * CONFIG.water.fps) % CONFIG.water.frameCount;
    if (fire !== this.lastFireFrame) { this.fire.setFrame(String(fire)); this.lastFireFrame = fire; }
    if (water !== this.lastWaterFrame) { this.water.setFrame(String(water)); this.lastWaterFrame = water; }
    this.fireflies.forEach((image, index) => {
      const p = fireflyPosition(index, this.elapsedMs), fly = CONFIG.fireflies[index];
      image.setPosition(p.x, p.y).setAlpha(.78 + .22 * Math.sin(this.elapsedMs / (570 + index * 109) + fly.phase));
    });
  }

  private registerFrames(key: string, sourceKey: string, area: typeof CONFIG.fire | typeof CONFIG.water) {
    const image = this.scene.textures.get(sourceKey).getSourceImage() as HTMLImageElement;
    const texture = this.scene.textures.addImage(key, image)!;
    for (let index = 0; index < area.frameCount; index++) {
      texture.add(String(index), 0, index % area.framesPerRow * area.width,
        Math.floor(index / area.framesPerRow) * area.height, area.width, area.height);
    }
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  private prepareFirefly() {
    const texture = this.scene.textures.createCanvas(FLY_KEY, 24, 24)!;
    const c = texture.context;
    for (let r = 11; r >= 3; r -= 2) {
      c.fillStyle = `rgba(255,193,48,${(12-r)*.012})`; c.beginPath(); c.arc(12,12,r,0,Math.PI*2); c.fill();
    }
    c.fillStyle = '#ffcb45'; c.fillRect(9,9,6,6); c.fillStyle = '#fff1a1'; c.fillRect(10,10,4,4);
    texture.refresh().setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  private destroy() {
    if (this.destroyed) return; this.destroyed = true;
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.fire.destroy(); this.water.destroy(); this.clean.destroy(); this.fireflies.forEach(image => image.destroy());
    for (const key of [FIRE_KEY, WATER_KEY, FLY_KEY]) this.scene.textures.remove(key);
  }
}
