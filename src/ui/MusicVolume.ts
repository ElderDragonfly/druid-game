import Phaser from 'phaser';
import type { MenuMusic } from '../audio/MenuMusic';

/** A fixed-size slider next to the speaker, independent of the menu's zoom. */
export function addMusicVolume(scene: Phaser.Scene, music: MenuMusic) {
  const camera = scene.cameras.getCamera('menu-ui')!;
  const slider = scene.add.container(0, 0).setName('music-volume').setSize(180, 48).setDepth(1000);
  const art = scene.add.graphics();
  const title = scene.add.text(-72, -12, 'Громкость', {
    fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#9dae94',
  }).setOrigin(0, .5);
  const percent = scene.add.text(72, -12, '', {
    fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#e6d9b4',
  }).setOrigin(1, .5).setName('music-volume-label');
  slider.add([art, title, percent]);
  slider.setInteractive({ hitArea: new Phaser.Geom.Rectangle(0, 0, 180, 48),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
  scene.cameras.main.ignore(slider);
  let dragging: number | undefined;
  const draw = () => {
    const x = -72 + music.volume * 144;
    slider.setData('volume', music.volume);
    percent.setText(`${Math.round(music.volume * 100)}%`);
    art.clear().fillStyle(0x060d09, .55).fillRoundedRect(-90, -20, 180, 48, 5);
    art.fillStyle(0x132219, .94).fillRoundedRect(-90, -24, 180, 48, 5);
    art.lineStyle(1, dragging === undefined ? 0x697958 : 0xc6b27b).strokeRoundedRect(-90, -24, 180, 48, 5);
    art.fillStyle(0x354537).fillRoundedRect(-72, 3, 144, 6, 3);
    if (x > -72) art.fillStyle(0xb8aa75).fillRoundedRect(-72, 3, x + 72, 6, 3);
    art.fillStyle(0xe6d9b4).fillRoundedRect(x - 4, -1, 8, 14, 2);
  };
  const update = (pointer: Phaser.Input.Pointer) => {
    const world = camera.getWorldPoint(pointer.x, pointer.y);
    const localX = (world.x - slider.x) / slider.scaleX;
    music.setVolume((localX + 72) / 144);
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
  const resize = () => {
    const { width, height } = scene.scale;
    slider.setScale(1 / camera.zoom).setPosition(480 + (width / 2 - 164) / camera.zoom,
      320 + (height / 2 - 40) / camera.zoom);
  };
  slider.on('pointerdown', down);
  scene.input.on(Phaser.Input.Events.POINTER_MOVE, move);
  scene.input.on(Phaser.Input.Events.POINTER_UP, release);
  scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
  scene.game.events.on(Phaser.Core.Events.BLUR, blur);
  music.on('changed', draw); scene.scale.on(Phaser.Scale.Events.RESIZE, resize);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.input.off(Phaser.Input.Events.POINTER_MOVE, move);
    scene.input.off(Phaser.Input.Events.POINTER_UP, release);
    scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
    scene.game.events.off(Phaser.Core.Events.BLUR, blur);
    music.off('changed', draw); scene.scale.off(Phaser.Scale.Events.RESIZE, resize);
  });
  draw(); resize();
}
