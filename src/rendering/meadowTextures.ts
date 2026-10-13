import Phaser from 'phaser';

export function createMeadowTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('meadow-tree-0')) return;
  const g = scene.add.graphics();
  const save = (key: string, width: number, height: number) => {
    g.generateTexture(key, width, height);
    scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    g.clear();
  };
  for (let variant = 0; variant < 3; variant++) {
    const dark = [0x1d382a, 0x203f31, 0x24372a][variant];
    const mid = [0x35543a, 0x3b6243, 0x475d37][variant];
    const light = [0x557345, 0x5b7c4d, 0x71834b][variant];
    g.fillStyle(0x15271e, 0.4).fillRect(4, 40, 24, 6);
    g.fillStyle(0x5b4030).fillRect(12, 25, 9, 19).fillRect(8, 42, 17, 4);
    g.fillStyle(0x936b43).fillRect(13, 27, 3, 16);
    g.fillStyle(dark).fillRect(2, 13, 28, 18).fillRect(5, 6, 22, 25).fillRect(10, 2, 12, 31);
    g.fillStyle(mid).fillRect(4, 12, 21, 15).fillRect(8, 7, 17, 19).fillRect(11, 4, 10, 21);
    g.fillStyle(light).fillRect(7, 12, 6, 7).fillRect(12, 8, 8, 6).fillRect(18, 17, 6, 5);
    g.fillStyle(dark).fillRect(1, 22, 8, 10).fillRect(23, 23, 8, 8).fillRect(10, 27, 14, 8);
    g.fillStyle(mid).fillRect(6, 23, 7, 5).fillRect(21, 24, 6, 4);
    save(`meadow-tree-${variant}`, 32, 48);
    g.fillStyle(0x193226, 0.55).fillRect(2, 12, 21, 5);
    g.fillStyle(dark).fillRect(1, 7, 22, 8).fillRect(4, 3, 16, 13);
    g.fillStyle(mid).fillRect(3, 5, 17, 7).fillRect(7, 2, 9, 11);
    g.fillStyle(light).fillRect(5, 6, 5, 3).fillRect(11, 3, 5, 4).fillRect(16, 8, 4, 3);
    save(`meadow-bush-${variant}`, 24, 18);
  }
  // Большой пень с корнями и кольцами на срезе.
  g.fillStyle(0x263023, 0.4).fillRect(3, 31, 59, 10);
  g.fillStyle(0x4b3325).fillRect(10, 15, 45, 25).fillRect(3, 33, 17, 8).fillRect(45, 31, 16, 10);
  g.fillStyle(0x785136).fillRect(13, 15, 39, 22).fillRect(8, 32, 12, 7).fillRect(46, 31, 9, 7);
  g.fillStyle(0xa4774b).fillRect(16, 19, 6, 16).fillRect(37, 18, 5, 17).fillRect(49, 21, 3, 13);
  g.fillStyle(0xc7a168).fillRect(13, 8, 39, 14).fillRect(18, 5, 28, 20);
  g.fillStyle(0x8d643d).fillRect(18, 9, 29, 12).fillRect(23, 7, 19, 16);
  g.fillStyle(0xd4b37c).fillRect(21, 10, 23, 9).fillRect(25, 8, 15, 13);
  g.fillStyle(0x916741).fillRect(26, 12, 12, 6);
  g.fillStyle(0xb9905b).fillRect(29, 13, 7, 3);
  g.fillStyle(0x557044).fillRect(10, 27, 5, 6).fillRect(49, 30, 8, 4);
  save('meadow-stump', 64, 44);
  // Временная игровая фигурка с капюшоном и седой бородой.
  g.fillStyle(0x17271e).fillRect(3, 2, 10, 16);
  g.fillStyle(0x49623b).fillRect(5, 1, 6, 2).fillRect(3, 3, 10, 5).fillRect(2, 9, 12, 7);
  g.fillStyle(0xc9a476).fillRect(5, 4, 6, 4);
  g.fillStyle(0x263027).fillRect(5, 5, 1, 1).fillRect(10, 5, 1, 1);
  g.fillStyle(0xb7baa4).fillRect(5, 8, 6, 3).fillRect(6, 11, 4, 2).fillRect(7, 13, 2, 1);
  g.fillStyle(0x8d7955).fillRect(3, 12, 3, 4).fillRect(10, 12, 3, 4);
  g.fillStyle(0x3c3023).fillRect(4, 17, 3, 3).fillRect(9, 17, 3, 3);
  save('meadow-druid', 16, 20);
  g.destroy();
}
