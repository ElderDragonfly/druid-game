import Phaser from 'phaser';
import { RoomScene } from './scenes/RoomScene';
import { SETTINGS } from './settings';
import './style.css';

export const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: SETTINGS.width,
  height: SETTINGS.height,
  backgroundColor: '#17241f',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [RoomScene],
});

// Vite заменяет старый экземпляр игры при обновлении исходников.
if (import.meta.hot) import.meta.hot.dispose(() => game.destroy(true));
