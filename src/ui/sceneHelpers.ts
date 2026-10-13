import Phaser from 'phaser';
import { MENU_LAYOUT } from './layout';

export function fitMenuCamera(scene: Phaser.Scene) {
  const fit = () => {
    const zoom = Math.min(scene.scale.width / 960, scene.scale.height / 640);
    scene.cameras.main.setZoom(zoom).centerOn(480, 320);
  };
  fit();
  scene.scale.on(Phaser.Scale.Events.RESIZE, fit);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, fit));
}

export function addCampBackground(scene: Phaser.Scene, texture: string, pixelScale = 1) {
  fitMenuCamera(scene);
  const b = MENU_LAYOUT.background;
  if (pixelScale > 1) {
    // Только фон рисуем в меньшем разрешении, затем увеличиваем без сглаживания.
    // Текст, кнопки и персонаж сохраняют свою чёткость и отдельные слои.
    const width = Math.round(b.width / pixelScale);
    const height = Math.round(b.height / pixelScale);
    const source = scene.make.image({ key: texture, x: width / 2, y: height / 2, add: false })
      .setDisplaySize(width, height);
    const background = scene.add.renderTexture(b.x, b.y, width, height);
    background.draw(source);
    source.destroy();
    background.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    background.setDisplaySize(b.width, b.height).setName('camp-background').setData('sourceTexture', texture);
  } else {
    // Уместить весь фон 16:9 в кадре, сохранив друида и посох у правого края.
    scene.add.image(b.x, b.y, texture).setDisplaySize(b.width, b.height).setName('camp-background').setData('sourceTexture', texture);
  }
  scene.input.setDefaultCursor('default');
}

export function bindSceneKey(scene: Phaser.Scene, event: string, action: () => void) {
  const keyboard = scene.input.keyboard!;
  keyboard.on(event, action);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.off(event, action));
}

export function addMenuHint(scene: Phaser.Scene, text: string) {
  scene.add.text(480, 614, text, {
    fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#9bac93',
  }).setOrigin(0.5);
}
