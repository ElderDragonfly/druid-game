import Phaser from 'phaser';
import sourceUrl from '../../docs/art/selection-camp-atmosphere-v1/environment-reference.png';
import cleanUrl from '../../docs/art/selection-camp-atmosphere-v1/firefly-clean-patches.png';
import { CAMP_ATMOSPHERE as CONFIG, fireflyPosition } from '../data/campAtmosphere';

export const CAMP_ATMOSPHERE_ART = [
  { key: 'camp-atmosphere-source', url: sourceUrl }, { key: 'camp-firefly-clean', url: cleanUrl },
];
const FIRE_KEY = 'selection-fire-frames', WATER_KEY = 'selection-water-frames', FLY_KEY = 'selection-firefly';
const waterPolygons = [
  [[551,251],[567,257],[591,250],[610,253],[603,261],[580,264],[575,270],[589,271],[595,276],[568,278],[559,273],[563,266],[549,263]],
  [[571,276],[599,273],[587,307],[554,313],[556,305],[565,291]],
  [[543,313],[569,310],[552,327],[533,334],[543,340],[531,350],[514,354],[517,362],[538,361],[531,370],[505,367],[502,355],[519,346],[525,336],[533,331]],
  [[447,357],[483,358],[510,367],[534,367],[527,379],[492,383],[466,380],[414,383],[410,376],[450,370]],
];
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

/** Menu-only, cached pixel frames. No physics, shader or per-frame pixel uploads. */
export class CampAtmosphere {
  readonly fire: Phaser.GameObjects.Image;
  readonly water: Phaser.GameObjects.Image;
  readonly fireflies: Phaser.GameObjects.Image[];
  private readonly clean: Phaser.GameObjects.Image;
  private elapsedMs = 0;
  private lastFrame = -1;
  private destroyed = false;

  constructor(private readonly scene: Phaser.Scene) {
    for (const art of CAMP_ATMOSPHERE_ART) scene.textures.get(art.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    const source = scene.textures.get('camp-atmosphere-source').getSourceImage() as HTMLImageElement;
    const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.imageSmoothingEnabled = false; context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, 960, 540);
    this.prepareFrames(FIRE_KEY, CONFIG.fire, pixels, false);
    this.prepareFrames(WATER_KEY, CONFIG.water, pixels, true);
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
    const frame = Math.floor(this.elapsedMs / 1000 * CONFIG.fps) % CONFIG.frameCount;
    if (frame !== this.lastFrame) {
      this.fire.setFrame(String(frame)); this.water.setFrame(String(frame)); this.lastFrame = frame;
    }
    this.fireflies.forEach((image, index) => {
      const p = fireflyPosition(index, this.elapsedMs), fly = CONFIG.fireflies[index];
      image.setPosition(p.x, p.y).setAlpha(.78 + .22 * Math.sin(this.elapsedMs / (570 + index * 109) + fly.phase));
    });
  }

  private prepareFrames(key: string, area: typeof CONFIG.fire | typeof CONFIG.water, source: ImageData, water: boolean) {
    const texture = this.scene.textures.createCanvas(key, area.width * CONFIG.framesPerRow,
      area.height * Math.ceil(CONFIG.frameCount / CONFIG.framesPerRow))!;
    const output = texture.context.createImageData(area.width, area.height);
    const maskCanvas = document.createElement('canvas'); maskCanvas.width = area.width; maskCanvas.height = area.height;
    const maskContext = maskCanvas.getContext('2d')!;
    if (water) for (const polygon of waterPolygons) {
      maskContext.beginPath(); polygon.forEach(([x,y], index) => index ? maskContext.lineTo(x-area.x,y-area.y) : maskContext.moveTo(x-area.x,y-area.y));
      maskContext.closePath(); maskContext.fill();
    }
    const mask = maskContext.getImageData(0, 0, area.width, area.height).data;
    for (let frame = 0; frame < CONFIG.frameCount; frame++) {
      const phase = frame / CONFIG.frameCount * Math.PI * 2;
      for (let y = 0; y < area.height; y++) for (let x = 0; x < area.width; x++) {
        const wx = area.x + x, wy = area.y + y, to = (y * area.width + x) * 4;
        const original = (wy * source.width + wx) * 4;
        let sx = wx, sy = wy, brightness = 1;
        const r = source.data[original], g = source.data[original+1], b = source.data[original+2];
        if (water && mask[to+3] > 200 && b > 70 && g > 50 && b > r * 1.1 && g > r * 1.2) {
          sx += Math.round(Math.sin(phase + wy * .17) * 1.2);
          sy += Math.round(Math.sin(phase * 2 + wx * .13) * 1.3);
          brightness = 1 + Math.sin(wy * .38 + wx * .08 - phase * 2) * .09;
          const sample = (sy * source.width + sx) * 4;
          if (source.data[sample+2] < source.data[sample] * 1.1) { sx = wx; sy = wy; }
        } else if (!water && wy < 402) {
          const envelope = clamp(1 - ((wx - 649) / 63) ** 2) * clamp((wy - area.y) / 18) * clamp((402 - wy) / 20);
          sx += Math.round(envelope * (Math.sin(phase + y * .07) * 3.5 + Math.sin(phase * 2 + y * .13) * 1.5));
          sy += Math.round(envelope * Math.sin(phase * 2 + x * .07) * 1.4);
          if (r > 125 && g > 45 && r > g * 1.08) brightness = 1 + .045 * Math.sin(phase * 3 + wy * .08);
        }
        sx = clamp(sx, area.x, area.x + area.width - 1); sy = clamp(sy, area.y, area.y + area.height - 1);
        const from = (sy * source.width + sx) * 4;
        for (let c = 0; c < 3; c++) output.data[to+c] = clamp(Math.round(source.data[from+c] * brightness), 0, 255);
        output.data[to+3] = 255;
      }
      const x = frame % CONFIG.framesPerRow * area.width, y = Math.floor(frame / CONFIG.framesPerRow) * area.height;
      texture.context.putImageData(output, x, y);
      texture.add(String(frame), 0, x, y, area.width, area.height);
    }
    texture.refresh().setFilter(Phaser.Textures.FilterMode.NEAREST);
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
