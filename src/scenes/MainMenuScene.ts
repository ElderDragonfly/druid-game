import Phaser from 'phaser';
import { MenuButton } from '../ui/MenuButton';
import { MENU_LAYOUT } from '../ui/layout';
import { addCampBackground, addMenuHint, bindSceneKey } from '../ui/sceneHelpers';
import { SCENES } from './keys';
import { addSeatedDruid } from '../rendering/druidArt';

export class MainMenuScene extends Phaser.Scene {
  constructor() { super(SCENES.mainMenu); }

  create() {
    addCampBackground(this, 'main-camp');
    const layout = MENU_LAYOUT.main;
    addSeatedDruid(this, layout.druid).setName('main-character-preview');
    this.add.text(layout.x, 236, 'Лесной лагерь', {
      fontFamily: 'Georgia, serif', fontSize: '29px', color: '#dfd8b7',
      shadow: { offsetX: 0, offsetY: 2, color: '#08120b', blur: 5, fill: true },
    }).setOrigin(0.5);
    const play = () => this.scene.start(SCENES.characterSelect);
    new MenuButton(this, layout.x, layout.playY, {
      name: 'play', label: 'Играть', width: layout.width, height: layout.height, onClick: play,
    }).setSelected(true);
    new MenuButton(this, layout.x, layout.exitY, {
      name: 'exit', label: 'Выход', width: layout.width, height: layout.height, enabled: false,
    });
    bindSceneKey(this, 'keyup-ENTER', play);
    addMenuHint(this, 'Enter — играть');
  }
}
