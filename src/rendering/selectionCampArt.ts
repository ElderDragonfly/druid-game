import Phaser from 'phaser';
import cleanPlate from '../../docs/art/druid-basic-seated-v1/camp-clean-plate.png';
import staff from '../../docs/art/druid-basic-seated-v1/staff-lying.png';
import unified from '../../docs/art/selection-camp-seam-v1/background.png';
import { addCampBackground } from '../ui/sceneHelpers';
import { DRUID_TEXTURES } from './druidArt';

export const SELECTION_CAMP_ART = [
  { key: 'selection-camp-plate', url: cleanPlate }, // retained source/reference
  { key: 'selection-camp-unified', url: unified },
  { key: DRUID_TEXTURES.campStaff, url: staff },
];

/** Environment only: it remains behind every selectable character. */
export function addSelectionCampBackground(scene: Phaser.Scene) {
  // One precomposed environment avoids the hard edge of an opaque half-screen plate.
  // The selected actor, equipment, water, fire and fireflies remain independent.
  addCampBackground(scene, 'selection-camp-unified');
}

export function prepareSelectionCampTextures(scene: Phaser.Scene) {
  for (const art of SELECTION_CAMP_ART) scene.textures.get(art.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
}
