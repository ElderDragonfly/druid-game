import Phaser from 'phaser';
import { menuMusic } from '../audio/MenuMusic';
import { MenuButton } from './MenuButton';

/** Reusable speaker control placed by its owning settings scene. */
export function addMusicToggle(scene: Phaser.Scene, x: number, y: number) {
  const music = menuMusic(scene.game);
  let pressed = false;
  const button = new MenuButton(scene, x, y, {
    name: 'music-toggle', label: '', width: 48, height: 48,
    onClick: () => { if (pressed) { pressed = false; music.toggle(); } },
  }).setDepth(1000);
  const icon = scene.add.graphics(); button.add(icon);
  const hint = scene.add.text(20, -34, '', {
    fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#e6d9b4',
    backgroundColor: '#132219', padding: { x: 7, y: 5 },
  }).setOrigin(1, 1).setVisible(false);
  button.add(hint);
  const draw = () => {
    button.setData('musicEnabled', music.enabled).setSelected(music.enabled);
    hint.setText(music.enabled ? 'Выключить музыку' : 'Включить музыку');
    icon.clear().fillStyle(0xe6d9b4).fillRect(-13, -5, 6, 10);
    icon.fillPoints([{ x: -8, y: -5 }, { x: 1, y: -12 }, { x: 1, y: 12 }, { x: -8, y: 5 }], true);
    icon.lineStyle(2, 0xe6d9b4);
    if (music.enabled) {
      icon.beginPath().arc(1, 0, 8, -.8, .8).strokePath();
      icon.beginPath().arc(1, 0, 14, -.8, .8).strokePath();
    } else icon.lineBetween(6, -7, 16, 7).lineBetween(16, -7, 6, 7);
  };
  scene.cameras.main.ignore(button);
  button.on('pointerdown', () => { pressed = true; });
  button.on('pointerover', () => hint.setVisible(true));
  button.on('pointerout', () => { pressed = false; hint.setVisible(false); });
  music.on('changed', draw);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    music.off('changed', draw);
  });
  draw();
}
