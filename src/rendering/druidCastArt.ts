import Phaser from 'phaser';
import { FACINGS, type Facing } from '../input/EightWayFacing';
import { CAST_FRAME_DURATIONS } from '../behavior/DruidCasting';

const sources = import.meta.glob<string>('../../docs/art/{druid-cast-eight-way-v1,druid-cast-right-v2,druid-cast-diagonal-v2,druid-cast-front-stable-v1,druid-facing-fixes-v1}/cast-*-512x384.png',
  { eager: true, query: '?url', import: 'default' });

const folders: Record<Facing, string> = {
  down: 'druid-cast-front-stable-v1', 'down-left': 'druid-facing-fixes-v1',
  up: 'druid-cast-eight-way-v1', left: 'druid-cast-eight-way-v1',
  right: 'druid-cast-right-v2', 'up-right': 'druid-cast-right-v2',
  'down-right': 'druid-cast-diagonal-v2', 'up-left': 'druid-cast-diagonal-v2',
};

export const CAST_METRICS = { width: 512, height: 384, offsetX: 128, offsetY: 40 } as const;

export const DRUID_CAST_ART = FACINGS.map(direction => {
  const url = sources[`../../docs/art/${folders[direction]}/cast-${direction}-512x384.png`];
  if (!url) throw new Error(`Missing druid cast: ${direction}`);
  return { direction, key: `druid-cast-${direction}`, url };
});

export const DRUID_CAST_APPEARANCE = Object.fromEntries(DRUID_CAST_ART.map(art => [art.direction, {
  texture: art.key,
  frames: CAST_FRAME_DURATIONS.map((_, index) => `cast-${art.direction}-${index}`),
}])) as Record<Facing, { texture: string; frames: string[] }>;

export function prepareDruidCastTextures(scene: Phaser.Scene) {
  for (const art of DRUID_CAST_ART) {
    const texture = scene.textures.get(art.key);
    // Read the accepted/native PNG directly, without resizing or recolouring.
    DRUID_CAST_APPEARANCE[art.direction].frames.forEach((frame, index) => {
      if (!texture.has(frame)) texture.add(frame, 0,
        (index + 1) * CAST_METRICS.width, 0, CAST_METRICS.width, CAST_METRICS.height);
    });
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}
