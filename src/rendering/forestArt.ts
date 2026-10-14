import Phaser from 'phaser';
import trees from '../../docs/art/conifer-trees-v1/trees-atlas.png';
import conifers from '../../docs/art/conifer-trees-v1/sprites.json';
import shadow from '../assets/environment/meadow-druid-shadow.png';
import floor from '../../docs/art/forest-floor-v1/forest-floor-darker.png';

export const FOREST_ART = [
  { key: 'forest-trees', url: trees },
  { key: 'meadow-druid-shadow', url: shadow },
  { key: 'forest-floor-source', url: floor },
] as const;

export function prepareForestTextures(scene: Phaser.Scene) {
  for (const art of FOREST_ART) scene.textures.get(art.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  for (const sprite of conifers.sprites) {
    const texture = scene.textures.get('forest-trees');
    const f = sprite.atlasFrame;
    if (!texture.has(sprite.id)) texture.add(sprite.id, 0, f.x, f.y, f.width, f.height);
  }
}
