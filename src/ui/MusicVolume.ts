import Phaser from 'phaser';
import type { MenuMusic } from '../audio/MenuMusic';

/** Settings positions the slider; the UI camera fits it with the rest of the panel. */
export function addMusicVolume(scene: Phaser.Scene, music: MenuMusic, x: number, y: number) {
  const camera = scene.cameras.getCamera('menu-ui')!;
  const width = 300, halfTrack = width / 2 - 18;
  const slider = scene.add.container(x, y).setName('music-volume').setSize(width, 48).setDepth(1000);
  const art = scene.add.graphics();
  const title = scene.add.text(-halfTrack, -12, 'Громкость', {
    fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#9dae94',
  }).setOrigin(0, .5);
  const percent = scene.add.text(halfTrack, -12, '', {
    fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#e6d9b4',
  }).setOrigin(1, .5).setName('music-volume-label');
  slider.add([art, title, percent]);
  slider.setInteractive({ hitArea: new Phaser.Geom.Rectangle(0, 0, width, 48),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
  scene.cameras.main.ignore(slider);
  let dragging: number | undefined;
  const draw = () => {
    const x = -halfTrack + music.volume * halfTrack * 2;
    slider.setData('volume', music.volume);
    percent.setText(`${Math.round(music.volume * 100)}%`);
    art.clear().fillStyle(0x060d09, .55).fillRoundedRect(-width / 2, -20, width, 48, 5);
    art.fillStyle(0x132219, .94).fillRoundedRect(-width / 2, -24, width, 48, 5);
    art.lineStyle(1, dragging === undefined ? 0x697958 : 0xc6b27b).strokeRoundedRect(-width / 2, -24, width, 48, 5);
    art.fillStyle(0x354537).fillRoundedRect(-halfTrack, 3, halfTrack * 2, 6, 3);
    if (x > -halfTrack) art.fillStyle(0xb8aa75).fillRoundedRect(-halfTrack, 3, x + halfTrack, 6, 3);
    art.fillStyle(0xe6d9b4).fillRoundedRect(x - 4, -1, 8, 14, 2);
  };
  const update = (pointer: Phaser.Input.Pointer) => {
    const world = camera.getWorldPoint(pointer.x, pointer.y);
    const localX = (world.x - slider.x) / slider.scaleX;
    music.setVolume((localX + halfTrack) / (halfTrack * 2));
  };
  const down = (pointer: Phaser.Input.Pointer) => {
    if (dragging !== undefined) return;
    dragging = pointer.id; update(pointer); draw();
  };
  const move = (pointer: Phaser.Input.Pointer) => {
    if (pointer.id === dragging && pointer.isDown) update(pointer);
  };
  const release = (pointer: Phaser.Input.Pointer) => {
    if (pointer.id === dragging) { dragging = undefined; draw(); }
  };
  const blur = () => { dragging = undefined; draw(); };
  slider.on('pointerdown', down);
  scene.input.on(Phaser.Input.Events.POINTER_MOVE, move);
  scene.input.on(Phaser.Input.Events.POINTER_UP, release);
  scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
  scene.game.events.on(Phaser.Core.Events.BLUR, blur);
  music.on('changed', draw);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.input.off(Phaser.Input.Events.POINTER_MOVE, move);
    scene.input.off(Phaser.Input.Events.POINTER_UP, release);
    scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
    scene.game.events.off(Phaser.Core.Events.BLUR, blur);
    music.off('changed', draw);
  });
  draw();
}
