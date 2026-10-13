import Phaser from 'phaser';
import { MENU_LAYOUT } from './layout';

export function addCampBackground(scene: Phaser.Scene, texture: string) {
  const b = MENU_LAYOUT.background;
  // Уместить весь фон 16:9 в кадре, сохранив друида и посох у правого края.
  scene.add.image(b.x, b.y, texture).setDisplaySize(b.width, b.height).setName('camp-background');
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
