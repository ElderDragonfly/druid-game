import Phaser from 'phaser';
import { MenuButton } from '../ui/MenuButton';
import { MENU_LAYOUT } from '../ui/layout';
import { addCampBackground, addMenuHint, bindSceneKey, setupMenuCameras } from '../ui/sceneHelpers';
import { SCENES } from './keys';

export class MainMenuScene extends Phaser.Scene {
  constructor() { super(SCENES.mainMenu); }

  create() {
    addCampBackground(this, 'main-camp');
    const layout = MENU_LAYOUT.main;
    const play = () => this.scene.start(SCENES.characterSelect);
    new MenuButton(this, layout.x, layout.playY, {
      name: 'play', label: 'Играть', width: layout.width, height: layout.height, onClick: play,
    }).setSelected(true);
    new MenuButton(this, layout.x, layout.exitY, {
      name: 'exit', label: 'Выход', width: layout.width, height: layout.height, enabled: false,
    });
    bindSceneKey(this, 'keyup-ENTER', play);
    addMenuHint(this, 'Enter — играть');
    setupMenuCameras(this);
  }
}
