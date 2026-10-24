import Phaser from 'phaser';
import foliage from '../../docs/art/forest-bushes-v2/foliage-atlas.png';
import { BUSHES } from '../data/bushes';

export const BUSH_ART = [
  { key: 'forest-bush-foliage', url: foliage },
] as const;
export function prepareBushTextures(scene: Phaser.Scene) {
  for (const art of BUSH_ART) {
    const texture = scene.textures.get(art.key);
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    for (const sprite of BUSHES) {
      const f = sprite.frame;
      if (!texture.has(sprite.id)) texture.add(sprite.id, 0, f.x, f.y, f.width, f.height);
    }
  }
}
