import Phaser from 'phaser';
import { PathwaysBootScene } from './PathwaysBootScene';
import { PathwaysRoomScene } from './PathwaysRoomScene';

export function createPathwaysGame() {
  return new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', width: 1280, height: 720,
    backgroundColor: '#17241f',
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [PathwaysBootScene, PathwaysRoomScene],
  });
}
