import Phaser from 'phaser';
import look from '../../docs/art/mouse-v1/mouse-look-32x32.png';
import run from '../../docs/art/mouse-v1/mouse-run-32x32.png';
import rise from '../../docs/art/mouse-v1/mouse-rise-32x32.png';
import source from '../../docs/art/mouse-v1/source.json';
import { MOUSE } from '../data/mouse';

export const MOUSE_ART = [
  { key: 'mouse-look', url: look }, { key: 'mouse-run', url: run }, { key: 'mouse-rise', url: rise },
] as const;

export function prepareMouseTextures(scene: Phaser.Scene) {
  for (const art of MOUSE_ART) scene.textures.get(art.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  for (const state of ['run', 'rise', 'look', 'lower'] as const) {
    const key = state === 'lower' ? 'mouse-rise' : `mouse-${state}`;
    const texture = scene.textures.get(key), count = state === 'look' ? source.frameCount : 4;
    const frames = Array.from({ length: count }, (_, index) => {
      const i = state === 'lower' ? count - 1 - index : index;
      const frame = `mouse-${state}-${index}`;
      if (!texture.has(frame)) texture.add(frame, 0, i * MOUSE.frameWidth, 0, MOUSE.frameWidth, MOUSE.frameHeight);
      return { key, frame, duration: state === 'look' ? source.durations[index] - 100 : 0 };
    });
    if (!scene.anims.exists(`mouse-${state}`)) scene.anims.create({ key: `mouse-${state}`, frames,
      frameRate: 1000 / (state === 'rise' || state === 'lower' ? MOUSE.transitionFrameMs : MOUSE.runFrameMs),
      repeat: state === 'run' ? -1 : 0 });
  }
}
