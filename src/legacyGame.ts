import Phaser from 'phaser';
import { RoomScene } from './scenes/RoomScene';
import { SETTINGS } from './settings';
import { BootScene } from './scenes/BootScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { SettingsScene } from './scenes/SettingsScene';

/** The original game stays available without changing its scenes or saves. */
export function createLegacyGame() {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: SETTINGS.width,
    height: SETTINGS.height,
    backgroundColor: '#17241f',
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [BootScene, MainMenuScene, CharacterSelectScene, SettingsScene, RoomScene],
  });
}
