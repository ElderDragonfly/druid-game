import Phaser from 'phaser';
import standing from '../assets/characters/druid-standing-detail.png';
import campSource from '../assets/characters/druid-camp-source.png';
import gameSource from '../assets/characters/druid-game-source.png';

export const DRUID_TEXTURES = {
  standing: 'druid-standing-detail',
  campSource: 'druid-camp-source', camp: 'druid-camp',
  gameSource: 'druid-game-source', game: 'druid-game',
} as const;

export const DRUID_ART = [
  { key: DRUID_TEXTURES.standing, url: standing, frame: { x: 275, y: 49, width: 745, height: 1129 } },
  { key: DRUID_TEXTURES.campSource, url: campSource, frame: { x: 280, y: 86, width: 769, height: 1093 } },
  { key: DRUID_TEXTURES.gameSource, url: gameSource, frame: { x: 154, y: 88, width: 844, height: 1250 } },
] as const;

export const CAMP_DRUID = {
  width: 40, height: 56, contentHeight: 50,
  scale: 2.5,
  seatOriginY: (1 + 50 * 0.67) / 56,
} as const;

export interface GameSpriteMetrics {
  width: number; height: number; scale: number; contentHeight: number;
  feetY: number; bodyWidth: number; bodyHeight: number; bodyCenterY: number;
}

export const GAME_DRUID = {
  // На треть больше пикселей по каждой стороне при прежнем размере на поляне.
  width: 32, height: 40, scale: 87.5 / 32,
  contentHeight: 33, feetY: 34,
  bodyWidth: 20, bodyHeight: 25, bodyCenterY: 10,
} as const satisfies GameSpriteMetrics;

const GAME_PALETTE = [
  0x142820,
  0x2e4931, 0x47613a, 0x667745,
  0x393022, 0x655134, 0x9c7e53,
  0xad8b60, 0xc7ab7b,
  0x637266, 0x9fa98e, 0xc9cbb1,
  0x203927, 0x547348, 0x80765a, 0xb6bba0,
];
// Палитра меню независима: изменения игрового спрайта не меняют сидящего друида.
const CAMP_PALETTE = [
  0x142820,
  0x2e4931, 0x47613a, 0x667745,
  0x393022, 0x655134, 0x9c7e53,
  0xad8b60, 0xc7ab7b,
  0x637266, 0x9fa98e, 0xc9cbb1,
  0x203927, 0xaaa17b, 0xbaa26b, 0x88947f,
];

interface SmallSprite {
  key: string; sourceKey: string;
  width: number; height: number; contentHeight: number;
  palette: readonly number[];
}

function prepareSmallSprite(scene: Phaser.Scene, art: SmallSprite) {
  if (scene.textures.exists(art.key)) return;
  const source = scene.textures.get(art.sourceKey).getSourceImage() as HTMLImageElement;
  const crop = DRUID_ART.find(item => item.key === art.sourceKey)!.frame;
  const texture = scene.textures.createCanvas(art.key, art.width, art.height)!;
  const context = texture.context;
  // Усредняем рисунок перед ограничением палитры: тонкие штрихи не становятся шумом.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const height = Math.min(art.contentHeight, (art.width - 2) * crop.height / crop.width);
  const width = Math.round(height * crop.width / crop.height);
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height,
    Math.round((art.width - width) / 2), 1, width, Math.round(height));
  const colors = art.palette.map(color => [color >>> 16, (color >>> 8) & 255, color & 255]);
  const pixels = context.getImageData(0, 0, art.width, art.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    if (pixels.data[i + 3] < 128) { pixels.data[i + 3] = 0; continue; }
    let nearest = colors[0];
    let best = Infinity;
    for (const color of colors) {
      const distance = (pixels.data[i] - color[0]) ** 2 + (pixels.data[i + 1] - color[1]) ** 2 +
        (pixels.data[i + 2] - color[2]) ** 2;
      if (distance < best) { nearest = color; best = distance; }
    }
    pixels.data[i] = nearest[0]; pixels.data[i + 1] = nearest[1]; pixels.data[i + 2] = nearest[2];
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  // Готовые пиксели увеличиваются строго без сглаживания.
  texture.refresh().setFilter(Phaser.Textures.FilterMode.NEAREST);
}

export function prepareDruidTextures(scene: Phaser.Scene) {
  for (const art of DRUID_ART) {
    const texture = scene.textures.get(art.key);
    if (!texture.has('figure')) texture.add('figure', 0, art.frame.x, art.frame.y, art.frame.width, art.frame.height);
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  prepareSmallSprite(scene, { ...CAMP_DRUID, key: DRUID_TEXTURES.camp, sourceKey: DRUID_TEXTURES.campSource, palette: CAMP_PALETTE });
  prepareSmallSprite(scene, { ...GAME_DRUID, key: DRUID_TEXTURES.game, sourceKey: DRUID_TEXTURES.gameSource, palette: GAME_PALETTE });
}
