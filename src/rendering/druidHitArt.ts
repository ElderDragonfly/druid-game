import Phaser from 'phaser';
import left from '../../docs/art/druid-hit-side-v1/hit-left-512x384.png';
import right from '../../docs/art/druid-hit-side-v1/hit-right-512x384.png';
import type { Facing } from '../input/EightWayFacing';
import { HIT_FRAME_DURATIONS } from '../behavior/DruidHitReaction';

export const HIT_METRICS = { width: 512, height: 384, offsetX: 128, offsetY: 40 } as const;
export const DRUID_HIT_ART = [ { key: 'druid-hit-left', url: left }, { key: 'druid-hit-right', url: right } ];
export const DRUID_HIT_APPEARANCE = Object.fromEntries(['left', 'right'].map(direction => [direction,
  { texture: `druid-hit-${direction}`, frames: HIT_FRAME_DURATIONS.map((_, index) => String(index)) },
])) as Partial<Record<Facing, { texture: string; frames: string[] }>>;

export function prepareDruidHitTextures(scene: Phaser.Scene) {
  for (const art of DRUID_HIT_ART) {
    const texture = scene.textures.get(art.key);
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    HIT_FRAME_DURATIONS.forEach((_, index) => texture.add(String(index), 0,
      index * HIT_METRICS.width, 0, HIT_METRICS.width, HIT_METRICS.height));
  }
}
