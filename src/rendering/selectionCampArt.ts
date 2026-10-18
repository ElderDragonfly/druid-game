import Phaser from 'phaser';
import cleanPlate from '../../docs/art/druid-basic-seated-v1/camp-clean-plate.png';
import staff from '../../docs/art/druid-camp-staff-leaning-v1/staff-leaning.png';
import { CAMP_DRUID, DRUID_TEXTURES } from './druidArt';

export const SELECTION_CAMP_ART = [
  { key: 'selection-camp-plate', url: cleanPlate },
  { key: DRUID_TEXTURES.campStaff, url: staff },
];

/** Environment only: it remains behind every selectable character. */
export function addSelectionCampPlate(scene: Phaser.Scene) {
  scene.add.image(CAMP_DRUID.position.x, CAMP_DRUID.position.y, 'selection-camp-plate')
    .setName('selection-camp-plate').setOrigin(0).setScale(CAMP_DRUID.scale);
}

export function prepareSelectionCampTextures(scene: Phaser.Scene) {
  for (const art of SELECTION_CAMP_ART) scene.textures.get(art.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
}
