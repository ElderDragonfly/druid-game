import Phaser from 'phaser';
import left from '../../docs/art/druid-hit-side-v1/hit-left-512x384.png';
import right from '../../docs/art/druid-hit-side-v1/hit-right-512x384.png';
import { FACINGS, type Facing } from '../input/EightWayFacing';
import { HIT_FRAME_DURATIONS } from '../behavior/DruidHitReaction';

export const HIT_METRICS = { width: 512, height: 384, offsetX: 128, offsetY: 40 } as const;
const newSources = import.meta.glob<string>('../../docs/art/druid-hit-eight-way-v1/hit-*-512x384.png',
  { eager: true, query: '?url', import: 'default' });
export const DRUID_HIT_ART = FACINGS.map(direction => {
  const url = direction === 'left' ? left : direction === 'right' ? right
    : newSources[`../../docs/art/druid-hit-eight-way-v1/hit-${direction}-512x384.png`];
  if (!url) throw new Error(`Missing druid hit art: ${direction}`);
  return { key: `druid-hit-${direction}`, url };
});
export const DRUID_HIT_APPEARANCE = Object.fromEntries(FACINGS.map(direction => [direction,
  { texture: `druid-hit-${direction}`, frames: HIT_FRAME_DURATIONS.map((_, index) => String(index)) },
])) as Record<Facing, { texture: string; frames: string[] }>;

export function prepareDruidHitTextures(scene: Phaser.Scene) {
  for (const art of DRUID_HIT_ART) {
    const texture = scene.textures.get(art.key);
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    HIT_FRAME_DURATIONS.forEach((_, index) => texture.add(String(index), 0,
      index * HIT_METRICS.width, 0, HIT_METRICS.width, HIT_METRICS.height));
  }
}
