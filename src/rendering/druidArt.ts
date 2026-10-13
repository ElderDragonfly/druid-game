import Phaser from 'phaser';
import standing from '../assets/characters/druid-standing-detail.png';
import seated from '../assets/characters/druid-seated-detail.png';
import gameSource from '../assets/characters/druid-game-source.png';

export const DRUID_TEXTURES = {
  standing: 'druid-standing-detail', seated: 'druid-seated-detail',
  gameSource: 'druid-game-source', game: 'druid-game',
} as const;

// Границы фигуры внутри PNG исключают прозрачные поля, сохраняя весь посох.
export const DRUID_ART = [
  { key: DRUID_TEXTURES.standing, url: standing, frame: { x: 275, y: 49, width: 745, height: 1129 } },
  { key: DRUID_TEXTURES.seated, url: seated, frame: { x: 240, y: 52, width: 845, height: 1114 } },
  { key: DRUID_TEXTURES.gameSource, url: gameSource, frame: { x: 155, y: 81, width: 869, height: 1254 } },
] as const;

export const GAME_DRUID = {
  width: 32, height: 40, scale: 1.75,
  bodyWidth: 20, bodyHeight: 25, bodyCenterY: 10,
} as const;

// Общая ограниченная палитра объединяет упрощённый рисунок с лесной поляной.
const GAME_PALETTE = [
  0x10231b, 0x1b3225, 0x29432c, 0x3a5331, 0x506b3c, 0x73804d,
  0x253b2d, 0x40593a, 0x5e7145,
  0x2d281e, 0x403727, 0x5c4a30, 0x77633c, 0x927746, 0xb2955b,
  0x83623f, 0xa07f53, 0xb8986b, 0xc7ad85,
  0x4e5c54, 0x6e7b6c, 0x909b88, 0xb0b7a0, 0xcdd0b6,
].map(color => [color >>> 16, (color >>> 8) & 255, color & 255]);

export function prepareDruidTextures(scene: Phaser.Scene) {
  for (const art of DRUID_ART) {
    const texture = scene.textures.get(art.key);
    if (!texture.has('figure')) texture.add('figure', 0, art.frame.x, art.frame.y, art.frame.width, art.frame.height);
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  if (scene.textures.exists(DRUID_TEXTURES.game)) return;
  const source = scene.textures.get(DRUID_TEXTURES.gameSource).getSourceImage() as HTMLImageElement;
  const crop = DRUID_ART[2].frame;
  const texture = scene.textures.createCanvas(DRUID_TEXTURES.game, GAME_DRUID.width, GAME_DRUID.height)!;
  const context = texture.context;
  context.imageSmoothingEnabled = false;
  const height = 33;
  const width = Math.round(height * crop.width / crop.height);
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height,
    Math.round((GAME_DRUID.width - width) / 2), 1, width, height);
  const pixels = context.getImageData(0, 0, GAME_DRUID.width, GAME_DRUID.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    if (pixels.data[i + 3] < 128) { pixels.data[i + 3] = 0; continue; }
    let nearest = GAME_PALETTE[0];
    let best = Infinity;
    for (const color of GAME_PALETTE) {
      const distance = (pixels.data[i] - color[0]) ** 2 + (pixels.data[i + 1] - color[1]) ** 2 +
        (pixels.data[i + 2] - color[2]) ** 2;
      if (distance < best) { nearest = color; best = distance; }
    }
    pixels.data[i] = nearest[0]; pixels.data[i + 1] = nearest[1]; pixels.data[i + 2] = nearest[2];
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  texture.refresh().setFilter(Phaser.Textures.FilterMode.NEAREST);
}

export function addSeatedDruid(scene: Phaser.Scene, placement: { x: number; feetY: number; height: number }) {
  const sprite = scene.add.image(placement.x, placement.feetY, DRUID_TEXTURES.seated, 'figure').setOrigin(0.5, 1);
  return sprite.setScale(placement.height / sprite.height);
}
