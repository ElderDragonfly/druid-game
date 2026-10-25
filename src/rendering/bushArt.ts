import Phaser from 'phaser';
import foliage from '../../docs/art/bush-rustle-v1/rustle-atlas.png';
import { ACTIVE_BUSH_VARIANT, BUSHES, BUSH_RUSTLE as R } from '../data/bushes';

export const BUSH_ART = [
  { key: 'forest-bush-foliage', url: foliage },
] as const;
export function prepareBushTextures(scene: Phaser.Scene) {
  for (const art of BUSH_ART) {
    const texture = scene.textures.get(art.key);
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    for (const sprite of [BUSHES[ACTIVE_BUSH_VARIANT]]) {
      const f = sprite.frame;
      if (!texture.has(sprite.id)) texture.add(sprite.id, 0, f.x, f.y, f.width, f.height);
    }
    for(let i=0;i<R.frames;i++)if(!texture.has(`rustle-${i}`))
      texture.add(`rustle-${i}`,0,i*R.cell+R.cropX,R.cropY,R.width,R.height);
  }
}
