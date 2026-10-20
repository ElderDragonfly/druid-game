import { FALLEN_LOG_ART } from './fallenLogArt';
import Phaser from 'phaser';
import trees from '../../docs/art/conifer-trees-v1/trees-atlas.png';
import conifers from '../../docs/art/conifer-trees-v1/sprites.json';
import shadow from '../assets/environment/meadow-druid-shadow.png';
import floor from '../../docs/art/upright-grass-preview-v1/grass-previous-reference.png';
import pine from '../../docs/art/pine-preview-v1/pine-dark-green.png';
import broadleaf from '../../docs/art/broadleaf-tree-v1/broadleaf.png';
import grassCoverage from '../assets/environment/grass-coverage-heights.png';

export const FOREST_ART = [
  ...FALLEN_LOG_ART,
  { key: 'forest-trees', url: trees },
  { key: 'forest-pine', url: pine },
  { key: 'forest-broadleaf', url: broadleaf },
  { key: 'meadow-druid-shadow', url: shadow },
  { key: 'forest-floor-source', url: floor },
  { key: 'forest-grass-coverage', url: grassCoverage },
] as const;

export function prepareForestTextures(scene: Phaser.Scene) {
  for (const art of FOREST_ART) scene.textures.get(art.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  for (const sprite of conifers.sprites) {
    const texture = scene.textures.get('forest-trees');
    const f = sprite.atlasFrame;
    if (!texture.has(sprite.id)) texture.add(sprite.id, 0, f.x, f.y, f.width, f.height);
  }
}
