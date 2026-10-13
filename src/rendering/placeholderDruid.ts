import Phaser from 'phaser';

// Отдельная временная текстура: меняем персонажа, не перерисовывая лес.
export const SEATED_DRUID_TEXTURE = 'druid-seated';

export function createPlaceholderDruid(scene: Phaser.Scene) {
  if (scene.textures.exists(SEATED_DRUID_TEXTURE)) return;
  const g = scene.add.graphics();
  g.fillStyle(0x17271f).fillRect(10, 8, 28, 38);
  g.fillStyle(0x4a6643).fillRect(14, 4, 18, 4).fillRect(10, 8, 26, 17);
  g.fillStyle(0x2b4434).fillRect(27, 12, 11, 25).fillRect(8, 24, 30, 20);
  g.fillStyle(0xd1ad7e).fillRect(13, 12, 12, 12);
  g.fillStyle(0x34332a).fillRect(14, 16, 2, 2).fillRect(21, 16, 2, 2);
  g.fillStyle(0xacb3a0).fillRect(13, 23, 13, 7).fillRect(16, 30, 9, 4).fillRect(19, 34, 4, 3);
  g.fillStyle(0x9f8862).fillRect(8, 36, 12, 9).fillRect(30, 35, 10, 9);
  g.fillStyle(0xc6a174).fillRect(8, 43, 8, 5).fillRect(31, 42, 8, 5);
  g.fillStyle(0x554535).fillRect(4, 47, 16, 9).fillRect(27, 46, 15, 10);
  g.fillStyle(0x30291f).fillRect(3, 56, 17, 5).fillRect(27, 56, 17, 6);
  g.generateTexture(SEATED_DRUID_TEXTURE, 48, 64);
  g.destroy();
  scene.textures.get(SEATED_DRUID_TEXTURE).setFilter(Phaser.Textures.FilterMode.NEAREST);
}
