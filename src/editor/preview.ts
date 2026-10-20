import { DRUID_ART } from '../rendering/druidArt';
import { DRUID_CAST_ART, CAST_METRICS } from '../rendering/druidCastArt';
import { DRUID_HIT_ART, HIT_METRICS } from '../rendering/druidHitArt';
import { HIT_FRAME_DURATIONS } from '../behavior/DruidHitReaction';
import { CAST_FRAME_DURATIONS, BASE_CAST_DURATION_SCALE } from '../data/attack';
import { WOLF_ART, wolfDurations, type WolfAnimation } from '../rendering/wolfArt';
import { MOUSE_ART } from '../rendering/mouseArt';
import mouseSource from '../../docs/art/mouse-v1/source.json';
import { FACINGS, type Facing } from '../input/EightWayFacing';
import { BASE_MOVEMENT_SPEED } from '../data/movement';
import type { EntityData, EntityId } from '../data/entitySchema';

export const DIRECTIONS = FACINGS;
export const ANIMATIONS: Record<EntityId, [string, string][]> = {
  druid: [['idle', 'Стоит'], ['walk', 'Ходьба'], ['cast', 'Каст'], ['hit', 'Попадание']],
  wolf: [['idle', 'Стоит'], ['walk', 'Прогулка'], ['run', 'Погоня'], ['attack-down', 'Укус вниз'], ['attack-up', 'Укус вверх'], ['death', 'Смерть']],
  mouse: [['run', 'Пробежка'], ['rise', 'Поднимается'], ['look', 'Осматривается'], ['lower', 'Опускается']],
};
const idleKeys: Record<Facing, string> = { down: 'druid-game-source', up: 'druid-back-source', left: 'druid-left-source', right: 'druid-right-source',
  'up-left': 'druid-up-left-source', 'up-right': 'druid-up-right-source', 'down-left': 'druid-down-left-source', 'down-right': 'druid-down-right-source' };
interface Sheet { url: string; width: number; height: number; start?: number; reverse?: boolean; durations: number[]; footY: number; scale: number; shadow?: string }
export class SpritePreview {
  entity: EntityId = 'druid'; animation = 'idle'; direction: Facing = 'down';
  playing = true;
  private elapsed = 0; private frame = 0; private lastTime = 0;
  private images = new Map<string, HTMLImageElement>(); private failed = new Set<string>();
  private context: CanvasRenderingContext2D;
  constructor(private canvas: HTMLCanvasElement, private data: () => EntityData | undefined, private label: HTMLElement) {
    this.context = canvas.getContext('2d')!;
    requestAnimationFrame(this.tick);
  }
  reset() { this.elapsed = 0; this.frame = 0; }
  step() { this.playing = false; this.frame++; }
  private image(url: string) {
    let image = this.images.get(url);
    if (!image) { image = new Image(); image.src = url; image.onerror = () => this.failed.add(url); this.images.set(url, image); }
    return image;
  }
  private sheet(data: EntityData): Sheet {
    const direction = this.direction;
    if (this.entity === 'druid') {
      const base = { width: 256, height: 320, durations: [1000], footY: 300, scale: .9 };
      if (this.animation === 'walk') return { ...base, url: DRUID_ART.find(a => a.key === `druid-walk-${direction}-source`)!.url,
        durations: Array(4).fill(160 * 220 / (BASE_MOVEMENT_SPEED * data.druid.speed)) };
      if (this.animation === 'cast') return { ...base, url: DRUID_CAST_ART.find(a => a.direction === direction)!.url,
        width: CAST_METRICS.width, height: CAST_METRICS.height, footY: 340, start: 1,
        durations: CAST_FRAME_DURATIONS.map(ms => ms * BASE_CAST_DURATION_SCALE / data.druid.attackRate) };
      if (this.animation === 'hit') return { ...base, url: DRUID_HIT_ART.find(a => a.key === `druid-hit-${direction}`)!.url,
        width: HIT_METRICS.width, height: HIT_METRICS.height, footY: 340, durations: [...HIT_FRAME_DURATIONS] };
      return { ...base, url: DRUID_ART.find(a => a.key === idleKeys[direction])!.url };
    }
    if (this.entity === 'wolf') {
      const state = this.animation as WolfAnimation;
      let durations = wolfDurations(state);
      if (state === 'walk') durations = durations.map(ms => ms * .45 / data.wolf.walkSpeed);
      if (state === 'run') durations = durations.map(ms => ms * 1.25 / data.wolf.runSpeed);
      if (state.startsWith('attack')) { const total = durations.reduce((a,b)=>a+b,0); durations = durations.map(ms=>ms/total*data.wolf.behavior.attackMs); }
      return { url: WOLF_ART.find(a => a.key === `wolf-${state}`)!.url,
        shadow: WOLF_ART.find(a => a.key === `wolf-${state}-shadow`)!.url,
        width: 128, height: 112, footY: 100, scale: 2.4, durations };
    }
    const state = this.animation;
    return { url: MOUSE_ART.find(a => a.key === (state === 'lower' ? 'mouse-rise' : `mouse-${state}`))!.url,
      width: 32, height: 32, footY: 25, scale: 7, reverse: state === 'lower',
      durations: state === 'look' ? mouseSource.durations : Array(4).fill(state === 'run' ? 100 * 90 / data.mouse.speed : 90) };
  }
  private tick = (time: number) => {
    const delta = this.lastTime ? Math.min(100, time - this.lastTime) : 0; this.lastTime = time;
    const ctx = this.context, data = this.data();
    ctx.clearRect(0, 0, 512, 384);
    if (data) {
      const sheet = this.sheet(data), image = this.image(sheet.url);
      if (this.playing) {
        this.elapsed += delta;
        while (this.elapsed >= sheet.durations[this.frame % sheet.durations.length]) {
          this.elapsed -= sheet.durations[this.frame % sheet.durations.length]; this.frame++;
        }
      }
      const count = sheet.durations.length, index = this.frame % count;
      const sourceIndex = (sheet.start ?? 0) + (sheet.reverse ? count - 1 - index : index);
      ctx.save(); ctx.imageSmoothingEnabled = false;
      ctx.translate(256, 352);
      if (this.entity !== 'druid' && (this.entity === 'wolf' ? this.direction === 'left' : this.direction === 'right')) ctx.scale(-1, 1);
      const draw = (img: HTMLImageElement) => {
        if (img.complete && img.naturalWidth) ctx.drawImage(img, sourceIndex * sheet.width, 0, sheet.width, sheet.height,
          -sheet.width * sheet.scale / 2, -sheet.footY * sheet.scale, sheet.width * sheet.scale, sheet.height * sheet.scale);
      };
      if (sheet.shadow) draw(this.image(sheet.shadow)); draw(image); ctx.restore();
      this.label.textContent = this.failed.has(sheet.url) ? 'Не удалось загрузить изображение.' :
        `Кадр ${index + 1} из ${count} · ${this.playing ? 'воспроизведение' : 'пауза'} · темп по значениям формы`;
    }
    requestAnimationFrame(this.tick);
  };
}
