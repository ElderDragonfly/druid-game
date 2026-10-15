import Phaser from 'phaser';
import trees from '../../docs/art/conifer-trees-v1/trees-atlas.png';
import conifers from '../../docs/art/conifer-trees-v1/sprites.json';
import shadow from '../assets/environment/meadow-druid-shadow.png';
import floor from '../../docs/art/forest-grass-v2/grass.png';
import flowers from '../../docs/art/forest-grass-v2/grass-flowers.png';
import pine from '../../docs/art/pine-preview-v1/pine-dark-green.png';

export const FOREST_ART = [
  { key: 'forest-trees', url: trees },
  { key: 'forest-pine', url: pine },
  { key: 'meadow-druid-shadow', url: shadow },
  { key: 'forest-floor-source', url: floor },
  { key: 'forest-floor-flowers-source', url: flowers },
] as const;

export function prepareForestTextures(scene: Phaser.Scene) {
  for (const art of FOREST_ART) scene.textures.get(art.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  for (const sprite of conifers.sprites) {
    const texture = scene.textures.get('forest-trees');
    const f = sprite.atlasFrame;
    if (!texture.has(sprite.id)) texture.add(sprite.id, 0, f.x, f.y, f.width, f.height);
  }
}
