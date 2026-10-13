import Phaser from 'phaser';
import { OBSTACLE_SIZES, seededRandom } from '../world/meadowLayout';
import { PixelArt } from './pixelArt';

const FOLIAGE = [
  [0x11271f, 0x1d3828, 0x304c32, 0x48633d, 0x657948],
  [0x122b23, 0x24412e, 0x395636, 0x536c40, 0x78834b],
  [0x172c22, 0x2b412b, 0x465934, 0x667341, 0x889151],
];

export function createMeadowTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('meadow-tree-0')) return;
  const g = scene.add.graphics();
  const p = new PixelArt(g);
  const save = (key: string, width: number, height: number) => {
    g.generateTexture(key, width, height);
    scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    g.clear();
  };

  // Низкие стволы и широкие кроны показывают больше верхней поверхности.
  for (let variant = 0; variant < 3; variant++) {
    const colors = FOLIAGE[variant];
    const random = seededRandom(0x7eaf + variant * 731);
    const cluster = (x: number, y: number, rx: number, ry: number) => {
      p.ellipse(colors[0], x, y + 1, rx + 1, ry + 1);
      p.ellipse(colors[1], x, y, rx, ry);
      p.ellipse(colors[2], x - 1, y - 1, rx - 1, ry - 1);
      p.ellipse(colors[3], x - 2, y - 2, rx * 0.55, ry * 0.5);
      for (let leaf = 0; leaf < rx * ry * 0.7; leaf++) {
        const dx = (random() * 2 - 1) * (rx - 1);
        const dy = (random() * 2 - 1) * (ry - 1);
        if ((dx / rx) ** 2 + (dy / ry) ** 2 > 0.8) continue;
        const color = dy < -ry * 0.3 ? colors[3 + Math.floor(random() * 2)] : colors[1 + Math.floor(random() * 3)];
        p.rect(color, x + dx, y + dy, 2, 1);
        if (leaf % 4 === 0) p.rect(color, x + dx + 1, y + dy + 1);
      }
    };
    p.ellipse(0x192c23, 24, 38, 18, 5);
    p.line(0x322f22, 21, 31, 13, 42, 3);
    p.line(0x322f22, 23, 33, 32, 41, 3);
    p.line(0x604b2e, 23, 29, 21, 41, 5);
    p.line(0x997148, 22, 29, 21, 39, 2);
    p.line(0x705435, 21, 36, 15, 42, 2);
    p.line(0x473b29, 25, 34, 32, 40, 2);
    // Асимметричные группы листьев вместо одной геометрической шапки.
    cluster(13, 15, 9, 9);
    cluster(28, 14, 10, 10);
    cluster(22, 10, 9, 8);
    cluster(10, 24, 8, 7);
    cluster(34, 23, 8, 8);
    cluster(22, 22, 11, 9);
    cluster(18, 29, 8, 6);
    cluster(29, 29, 7, 5);
    p.rect(colors[0], 24, 29, 2, 3);
    p.rect(colors[3], 11, 17, 3, 1);
    save('meadow-tree-' + variant, OBSTACLE_SIZES.tree.textureWidth, OBSTACLE_SIZES.tree.textureHeight);

    p.ellipse(0x172e24, 15, 18, 12, 3);
    cluster(8, 12, 6, 6);
    cluster(18, 12, 7, 7);
    cluster(14, 7, 6, 5);
    cluster(13, 15, 7, 4);
    if (variant === 1) {
      p.rect(0xa18a52, 7, 10, 2, 2);
      p.rect(0xc0a767, 8, 10);
      p.rect(0x98743d, 19, 14, 2, 2);
    }
    save('meadow-bush-' + variant, OBSTACLE_SIZES.bush.textureWidth, OBSTACLE_SIZES.bush.textureHeight);
  }

  // Срез стал шире и глубже; видимой боковой коры меньше, чем раньше.
  p.ellipse(0x192c23, 33, 35, 29, 7);
  for (const [x, y] of [[5, 32], [10, 40], [52, 39], [58, 30], [19, 42]]) {
    p.line(0x342d21, 32, 26, x, y, 4);
    p.line(0x645034, 31, 25, x, y, 2);
  }
  p.ellipse(0x463727, 32, 26, 24, 13);
  p.ellipse(0x795839, 31, 24, 22, 12);
  for (let x = 12; x <= 52; x += 6) p.line(0x463727, x, 25, x - 1, 34, 2);
  p.ellipse(0x3f3525, 32, 18, 24, 16);
  p.ellipse(0x9b8052, 31, 17, 22, 14);
  p.ellipse(0x685336, 31, 17, 18, 11);
  p.ellipse(0xb49a67, 30, 16, 16, 10);
  p.ellipse(0x7e6742, 30, 16, 11, 7);
  p.ellipse(0xb09a69, 30, 16, 9, 5);
  p.ellipse(0x7f6743, 29, 16, 4, 2);
  p.line(0x55432e, 40, 25, 50, 29);
  p.line(0x55432e, 41, 24, 45, 25);
  p.line(0xc3a979, 16, 10, 25, 6);
  p.rect(0x435739, 10, 24, 5, 4);
  p.rect(0x586a40, 10, 23, 3, 2);
  p.rect(0x344b32, 49, 28, 6, 4);
  p.rect(0x627542, 49, 28, 3, 2);
  save('meadow-stump', OBSTACLE_SIZES.stump.textureWidth, OBSTACLE_SIZES.stump.textureHeight);

  // Друид сверху: виден верх капюшона и плечи; лицо и борода ниже.
  p.line(0x2c2920, 20, 25, 21, 9, 2);
  p.line(0x705839, 20, 24, 21, 10);
  p.line(0x705839, 21, 10, 19, 5);
  p.line(0x705839, 19, 5, 22, 2);
  p.rect(0x607342, 21, 2, 2, 2);
  p.rect(0x7c8751, 18, 4, 2, 1);
  p.rect(0xb2a383, 22, 6, 1, 3);
  p.ellipse(0x13281f, 11, 18, 9, 6);
  p.ellipse(0x304b32, 11, 16, 8, 6);
  p.rect(0x3e5839, 4, 13, 5, 7);
  p.rect(0x4f6540, 5, 13, 3, 5);
  p.rect(0x203a2b, 14, 14, 4, 7);
  p.rect(0x263e2d, 6, 19, 10, 4);
  p.rect(0x4e4930, 7, 19, 8, 1);
  p.rect(0x3a3023, 6, 23, 4, 3);
  p.rect(0x342c22, 13, 23, 4, 3);
  p.rect(0x64543b, 6, 23, 2, 1);
  p.rect(0x625238, 13, 23, 2, 1);
  p.rect(0x88764f, 3, 16, 3, 3);
  p.rect(0xbf9c6b, 3, 18, 2, 2);
  p.rect(0xb59365, 18, 15, 3, 3);
  p.rect(0x4b6340, 14, 19, 2, 3);
  p.rect(0x74804c, 15, 20);
  p.ellipse(0x152b21, 11, 8, 7, 7);
  p.ellipse(0x3b5436, 11, 7, 6, 6);
  p.ellipse(0x586e43, 10, 5, 4, 3);
  p.rect(0x6d7c4d, 8, 3, 4, 1);
  p.ellipse(0x182d23, 11, 10, 4, 4);
  p.rect(0xb9986c, 8, 9, 6, 3);
  p.rect(0x765e43, 13, 10, 1, 3);
  p.rect(0x293027, 9, 10);
  p.rect(0x293027, 12, 10);
  p.rect(0xadb29b, 8, 12, 6, 2);
  p.rect(0xc6c5ac, 9, 13, 4, 2);
  p.rect(0x8c9b88, 10, 15, 3, 2);
  p.rect(0xb2b6a1, 11, 17);
  save('meadow-druid', 24, 28);
  p.ellipse(0x13291f, 8, 3, 7, 2);
  save('meadow-druid-shadow', 16, 6);
  g.destroy();
}
