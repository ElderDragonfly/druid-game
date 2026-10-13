import Phaser from 'phaser';
import standing from '../assets/characters/druid-standing-detail.png';
import campSource from '../../docs/art/druid-detail-preview-v1/character-selection-preview.png';
import gameSource from '../../docs/art/druid-turnaround-v3/druid-four-views.png';
import type { Facing } from '../input/FourWayFacing';

export const DRUID_TEXTURES = {
  standing: 'druid-standing-detail',
  campSource: 'druid-camp-source', camp: 'druid-camp',
  gameSource: 'druid-game-source', game: 'druid-game',
} as const;

export const DRUID_ART = [
  { key: DRUID_TEXTURES.standing, url: standing, frame: { x: 275, y: 49, width: 745, height: 1129 } },
  { key: DRUID_TEXTURES.campSource, url: campSource, frame: { x: 840, y: 80, width: 696, height: 864 } },
  { key: DRUID_TEXTURES.gameSource, url: gameSource, frame: { x: 0, y: 0, width: 1254, height: 1254 } },
] as const;

export const CAMP_DRUID = {
  width: 696, height: 864, scale: 960 / 1536,
  position: { x: 525, y: 50 },
} as const;

export interface GameSpriteMetrics {
  width: number; height: number; scale: number;
  feetY: number; bodyWidth: number; bodyHeight: number; bodyCenterY: number;
}

export const GAME_DRUID = {
  // Исходные детали сохраняются; размер в мире и физическое тело независимы.
  width: 512, height: 640, scale: 87.5 / 512, feetY: 600,
  bodyWidth: 20, bodyHeight: 25, bodyCenterY: 10,
} as const satisfies GameSpriteMetrics;

interface DruidView {
  direction: Facing;
  x: number; y: number; width: number; height: number;
  footX: number;
}

// Границы из одобренного листа. footX — центр пары сапог относительно кадра,
// а не середина фигуры вместе с посохом: смена ракурса не сдвигает опору.
export const DRUID_VIEWS: readonly DruidView[] = [
  { direction: 'down', x: 174, y: 47, width: 425, height: 549, footX: 200 },
  { direction: 'left', x: 724, y: 59, width: 349, height: 548, footX: 184 },
  { direction: 'right', x: 196, y: 648, width: 363, height: 542, footX: 178 },
  { direction: 'up', x: 697, y: 641, width: 402, height: 546, footX: 213 },
];

export function prepareDruidTextures(scene: Phaser.Scene) {
  for (const art of DRUID_ART) {
    const texture = scene.textures.get(art.key);
    if (!texture.has('figure')) texture.add('figure', 0, art.frame.x, art.frame.y, art.frame.width, art.frame.height);
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  if (!scene.textures.exists(DRUID_TEXTURES.camp)) {
    const crop = DRUID_ART.find(art => art.key === DRUID_TEXTURES.campSource)!.frame;
    const source = scene.textures.get(DRUID_TEXTURES.campSource).getSourceImage() as HTMLImageElement;
    const camp = scene.textures.createCanvas(DRUID_TEXTURES.camp, crop.width, crop.height)!;
    camp.context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    camp.refresh().setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  if (!scene.textures.exists(DRUID_TEXTURES.game)) {
    const source = scene.textures.get(DRUID_TEXTURES.gameSource).getSourceImage() as HTMLImageElement;
    const { width, height, feetY } = GAME_DRUID;
    const atlas = scene.textures.createCanvas(DRUID_TEXTURES.game, width * DRUID_VIEWS.length, height)!;
    atlas.context.imageSmoothingEnabled = false;
    DRUID_VIEWS.forEach((view, index) => {
      const frameX = index * width;
      const x = frameX + width / 2 - view.footX;
      const y = feetY - view.height;
      // Копирование 1:1: не уменьшаем сетку и не ограничиваем палитру.
      atlas.context.drawImage(source, view.x, view.y, view.width, view.height, x, y, view.width, view.height);
      atlas.add(view.direction, 0, frameX, 0, width, height);
    });
    // Убираем слабую фоновую дымку генерации; цвет и детали фигуры сохраняются.
    const pixels = atlas.context.getImageData(0, 0, atlas.width, atlas.height);
    for (let i = 3; i < pixels.data.length; i += 4) {
      if (pixels.data[i] < 128) pixels.data[i] = 0;
    }
    atlas.context.putImageData(pixels, 0, 0);
    atlas.refresh().setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}
