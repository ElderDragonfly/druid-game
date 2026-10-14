import Phaser from 'phaser';
import trees from '../../docs/art/forest-environment-v1/trees-atlas.png';
import rocks from '../../docs/art/forest-environment-v1/rocks-atlas.png';
import collection from '../../docs/art/forest-environment-v1/sprites.json';
import bush0 from '../assets/environment/meadow-bush-0.png';
import bush1 from '../assets/environment/meadow-bush-1.png';
import bush2 from '../assets/environment/meadow-bush-2.png';
import shadow from '../assets/environment/meadow-druid-shadow.png';

export const FOREST_ART = [
  { key: 'forest-trees', url: trees }, { key: 'forest-rocks', url: rocks },
  { key: 'meadow-bush-0', url: bush0 }, { key: 'meadow-bush-1', url: bush1 }, { key: 'meadow-bush-2', url: bush2 },
  { key: 'meadow-druid-shadow', url: shadow },
] as const;

export function prepareForestTextures(scene: Phaser.Scene) {
  for (const art of FOREST_ART) scene.textures.get(art.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  for (const sprite of collection.sprites) {
    if (sprite.category !== 'tree' && sprite.category !== 'rock') continue;
    const texture = scene.textures.get(sprite.category === 'tree' ? 'forest-trees' : 'forest-rocks');
    const f = sprite.atlasFrame;
    if (!texture.has(sprite.id)) texture.add(sprite.id, 0, f.x, f.y, f.width, f.height);
  }
}
