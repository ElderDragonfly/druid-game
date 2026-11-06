import Phaser from 'phaser';
import { DRUID_ART, prepareDruidTextures } from '../rendering/druidArt';
import { FOREST_ART, prepareForestTextures } from '../rendering/forestArt';

/** Only the approved druid and forest assets; no legacy world or menu startup. */
export class PathwaysBootScene extends Phaser.Scene {
  private failed = false;
  constructor() { super('PathwaysBoot'); }

  preload() {
    this.load.once('loaderror', () => { this.failed = true; });
    [...DRUID_ART, ...FOREST_ART].forEach(art => this.load.image(art.key, art.url));
  }

  create() {
    if (this.failed) {
      this.add.text(24, 24, 'Не удалось загрузить лес. Обновите страницу.', { color: '#e5dfc6' });
      return;
    }
    prepareDruidTextures(this);
    prepareForestTextures(this);
    this.scene.start('PathwaysRoom');
  }
}
