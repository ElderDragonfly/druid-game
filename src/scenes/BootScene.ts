import Phaser from 'phaser';
import mainCamp from '../assets/main-camp.png';
import selectionCamp from '../assets/selection-camp.png';
import { createPlaceholderDruid } from '../rendering/placeholderDruid';
import { SCENES } from './keys';
import { fitMenuCamera } from '../ui/sceneHelpers';

export class BootScene extends Phaser.Scene {
  private message!: Phaser.GameObjects.Text;
  private failed = false;

  constructor() { super(SCENES.boot); }

  preload() {
    fitMenuCamera(this);
    this.failed = false;
    this.message = this.add.text(480, 300, 'Лес просыпается…', {
      fontFamily: 'Georgia, serif', fontSize: '26px', color: '#d9d9b8',
    }).setOrigin(0.5);
    const progress = this.add.graphics();
    this.load.on('progress', (value: number) => {
      progress.clear().fillStyle(0x26382a).fillRect(340, 350, 280, 3);
      progress.fillStyle(0xb8aa75).fillRect(340, 350, 280 * value, 3);
    });
    this.load.once('loaderror', () => { this.failed = true; });
    this.load.image('main-camp', mainCamp);
    this.load.image('selection-camp', selectionCamp);
  }

  create() {
    if (this.failed) {
      this.message.setText('Не удалось загрузить фон. Обновите страницу.').setFontSize(20);
      return;
    }
    this.textures.get('selection-camp').setFilter(Phaser.Textures.FilterMode.NEAREST);
    createPlaceholderDruid(this);
    this.scene.start(SCENES.mainMenu);
  }
}
