import Phaser from 'phaser';
import { CAMP_ATMOSPHERE_ART } from '../rendering/CampAtmosphere';
import { SELECTION_CAMP_ART, prepareSelectionCampTextures } from '../rendering/selectionCampArt';
import { DRUID_HIT_ART, prepareDruidHitTextures } from '../rendering/druidHitArt';
import { WOLF_ART, prepareWolfTextures } from '../rendering/wolfArt';
import mainCamp from '../assets/main-camp.png';
import selectionCamp from '../assets/selection-camp.png';
import { DRUID_ART, prepareDruidTextures } from '../rendering/druidArt';
import { FOREST_ART, prepareForestTextures } from '../rendering/forestArt';
import { SCENES } from './keys';
import { fitMenuCamera } from '../ui/sceneHelpers';
import { MOUSE_ART, prepareMouseTextures } from '../rendering/mouseArt';
import { DRUID_CAST_ART, prepareDruidCastTextures } from '../rendering/druidCastArt';
import { ACORN_ART, prepareAcornTextures } from '../rendering/acornArt';

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
    CAMP_ATMOSPHERE_ART.forEach(art => this.load.image(art.key, art.url));
    ACORN_ART.forEach(art => this.load.image(art.key, art.url));
    SELECTION_CAMP_ART.forEach(art => this.load.image(art.key, art.url));
    this.load.image('main-camp', mainCamp);
    this.load.image('selection-camp', selectionCamp);
    DRUID_ART.forEach(art => this.load.image(art.key, art.url));
    DRUID_HIT_ART.forEach(art => this.load.image(art.key, art.url));
    DRUID_CAST_ART.forEach(art => this.load.image(art.key, art.url));
    FOREST_ART.forEach(art => this.load.image(art.key, art.url));
    WOLF_ART.forEach(art => this.load.image(art.key, art.url));
    MOUSE_ART.forEach(art => this.load.image(art.key, art.url));
  }

  create() {
    if (this.failed) {
      this.message.setText('Не удалось загрузить изображения. Обновите страницу.').setFontSize(20);
      return;
    }
    this.textures.get('selection-camp').setFilter(Phaser.Textures.FilterMode.NEAREST);
    prepareDruidTextures(this);
    prepareSelectionCampTextures(this);
    prepareDruidCastTextures(this);
    prepareDruidHitTextures(this);
    prepareForestTextures(this);
    prepareMouseTextures(this);
    prepareWolfTextures(this);
    prepareAcornTextures(this);
    this.scene.start(SCENES.mainMenu);
  }
}
