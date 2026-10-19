import Phaser from 'phaser';
import { MenuButton } from '../ui/MenuButton';
import { MENU_LAYOUT } from '../ui/layout';
import { addCampBackground, addMenuHint, bindSceneKey, setupMenuCameras } from '../ui/sceneHelpers';
import { SCENES } from './keys';
import { addMusicToggle } from '../ui/MusicToggle';
import { loadRun } from '../persistence/runSave';

export class MainMenuScene extends Phaser.Scene {
  constructor() { super(SCENES.mainMenu); }

  create(data: { sessionOnlySave?: boolean } = {}) {
    addCampBackground(this, 'main-camp');
    const layout = MENU_LAYOUT.main;
    const play = () => this.scene.start(SCENES.characterSelect);
    if (loadRun()) new MenuButton(this, layout.x, layout.playY - 74, {
      name: 'continue-run', label: 'Продолжить', width: layout.width, height: layout.height,
      onClick: () => { const savedRun = loadRun(); if (savedRun) this.scene.start(SCENES.room, { savedRun }); },
    });
    new MenuButton(this, layout.x, layout.playY, {
      name: 'play', label: 'Играть', width: layout.width, height: layout.height, onClick: play,
    }).setSelected(true);
    new MenuButton(this, layout.x, layout.exitY, {
      name: 'exit', label: 'Выход', width: layout.width, height: layout.height, enabled: false,
    });
    bindSceneKey(this, 'keyup-ENTER', play);
    addMenuHint(this, 'Enter — играть');
    if (data.sessionOnlySave) this.add.text(480, 576, 'Сохранение доступно до закрытия вкладки: хранилище браузера недоступно.', {
      fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#dccda9',
    }).setOrigin(.5);
    setupMenuCameras(this);
    addMusicToggle(this);
  }
}
