import Phaser from 'phaser';
import { menuMusic } from '../audio/MenuMusic';
import { MenuButton } from '../ui/MenuButton';
import { addMusicToggle } from '../ui/MusicToggle';
import { addMusicVolume } from '../ui/MusicVolume';
import { addCampBackground, addMenuHint, bindSceneKey, setupMenuCameras } from '../ui/sceneHelpers';
import { SCENES } from './keys';

/** Settings have their own scene; character-selection artwork stays unobstructed. */
export class SettingsScene extends Phaser.Scene {
  constructor() { super(SCENES.settings); }

  create() {
    addCampBackground(this, 'main-camp');
    this.add.rectangle(480, 320, 960, 640, 0x060d09, .48);
    this.add.rectangle(480, 330, 500, 340, 0x132219, .96).setStrokeStyle(1, 0x697958);
    this.add.text(480, 218, 'Настройки', {
      fontFamily: 'Georgia, serif', fontSize: '30px', color: '#e6d9b4',
    }).setOrigin(.5);
    this.add.text(330, 285, 'Музыка', {
      fontFamily: 'Georgia, serif', fontSize: '22px', color: '#e6d9b4',
    }).setOrigin(0, .5);
    const back = () => this.scene.start(SCENES.mainMenu);
    new MenuButton(this, 480, 450, { name: 'settings-back', label: 'Назад', width: 180, onClick: back });
    bindSceneKey(this, 'keyup-ESC', back);
    addMenuHint(this, 'Esc — назад');
    setupMenuCameras(this);
    const music = menuMusic(this.game);
    music.setInMenu(true);
    addMusicToggle(this, 620, 285);
    addMusicVolume(this, music, 480, 360);
  }
}
