import Phaser from 'phaser';
import standing from '../assets/characters/druid-standing-detail.png';
import campSource from '../../docs/art/druid-detail-preview-v1/character-selection-preview.png';
import gameSource from '../../docs/art/druid-front-resolution-v1/druid-front-64x80.png';
import leftSource from '../assets/characters/druid-left-64x80.png';
import rightSource from '../assets/characters/druid-right-64x80.png';
import backSource from '../assets/characters/druid-back-64x80.png';
import walkDownSource from '../../docs/art/druid-walk-down-v2/walk-down-64x80.png';
import walkUpSource from '../../docs/art/druid-walk-other-directions-v1/walk-up-64x80.png';
import walkLeftSource from '../../docs/art/druid-walk-left-v3/walk-left-64x80.png';
import type { Facing } from '../input/FourWayFacing';

export const DRUID_TEXTURES = {
  standing: 'druid-standing-detail',
  campSource: 'druid-camp-source', camp: 'druid-camp',
  gameSource: 'druid-game-source', game: 'druid-game',
  leftSource: 'druid-left-source', rightSource: 'druid-right-source', backSource: 'druid-back-source',
  walkDown: 'druid-walk-down-source',
  walkUp: 'druid-walk-up-source',
  walkLeft: 'druid-walk-left-source',
} as const;

export const DRUID_ART = [
  { key: DRUID_TEXTURES.standing, url: standing, frame: { x: 275, y: 49, width: 745, height: 1129 } },
  { key: DRUID_TEXTURES.campSource, url: campSource, frame: { x: 840, y: 80, width: 696, height: 864 } },
  { key: DRUID_TEXTURES.gameSource, url: gameSource, frame: { x: 0, y: 0, width: 64, height: 80 } },
  { key: DRUID_TEXTURES.leftSource, url: leftSource, frame: { x: 0, y: 0, width: 64, height: 80 } },
  { key: DRUID_TEXTURES.rightSource, url: rightSource, frame: { x: 0, y: 0, width: 64, height: 80 } },
  { key: DRUID_TEXTURES.backSource, url: backSource, frame: { x: 0, y: 0, width: 64, height: 80 } },
  { key: DRUID_TEXTURES.walkDown, url: walkDownSource, frame: { x: 0, y: 0, width: 64, height: 80 } },
  { key: DRUID_TEXTURES.walkUp, url: walkUpSource, frame: { x: 0, y: 0, width: 64, height: 80 } },
  { key: DRUID_TEXTURES.walkLeft, url: walkLeftSource, frame: { x: 0, y: 0, width: 64, height: 80 } },
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
  // Выбранная сетка 64×80; размер в мире и физическое тело прежние.
  width: 64, height: 80, scale: 87.5 / 64, feetY: 75,
  bodyWidth: 20, bodyHeight: 25, bodyCenterY: 10,
} as const satisfies GameSpriteMetrics;

interface DruidView {
  direction: Facing;
  sourceKey: string;
  x: number; y: number; width: number; height: number;
  footX: number;
}

// Каждый ракурс задаётся собственным PNG; замена не затрагивает движение и физику.
// Последние пять строк PNG прозрачны; опора ног остаётся на строке 75.
export const DRUID_VIEWS: readonly DruidView[] = [
  { direction: 'down', sourceKey: DRUID_TEXTURES.gameSource, x: 0, y: 0, width: 64, height: 75, footX: 32 },
  { direction: 'left', sourceKey: DRUID_TEXTURES.leftSource, x: 0, y: 0, width: 64, height: 75, footX: 32 },
  { direction: 'right', sourceKey: DRUID_TEXTURES.rightSource, x: 0, y: 0, width: 64, height: 75, footX: 32 },
  { direction: 'up', sourceKey: DRUID_TEXTURES.backSource, x: 0, y: 0, width: 64, height: 75, footX: 32 },
];

// Новые циклы добавляются сюда; отсутствие цикла оставляет неподвижный ракурс.
export const DRUID_WALKS = [
  { direction: 'down', sourceKey: DRUID_TEXTURES.walkDown, animationKey: 'druid-walk-down',
    frameCount: 4, frameDurationMs: 160 },
  { direction: 'up', sourceKey: DRUID_TEXTURES.walkUp, animationKey: 'druid-walk-up',
    frameCount: 4, frameDurationMs: 160 },
  { direction: 'left', sourceKey: DRUID_TEXTURES.walkLeft, animationKey: 'druid-walk-left',
    frameCount: 4, frameDurationMs: 160 },
] as const;

export const DRUID_WALK_ANIMATIONS = Object.fromEntries(
  DRUID_WALKS.map(walk => [walk.direction, walk.animationKey]),
) as Partial<Record<Facing, string>>;

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
    const { width, height, feetY } = GAME_DRUID;
    const atlas = scene.textures.createCanvas(DRUID_TEXTURES.game, width * DRUID_VIEWS.length, height)!;
    atlas.context.imageSmoothingEnabled = false;
    DRUID_VIEWS.forEach((view, index) => {
      const source = scene.textures.get(view.sourceKey).getSourceImage() as HTMLImageElement;
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
  for (const walk of DRUID_WALKS) {
    const texture = scene.textures.get(walk.sourceKey);
    const frames = Array.from({ length: walk.frameCount }, (_, index) => {
      const frame = `walk-${walk.direction}-${index}`;
      if (!texture.has(frame)) texture.add(frame, 0, index * GAME_DRUID.width, 0, GAME_DRUID.width, GAME_DRUID.height);
      return { key: walk.sourceKey, frame };
    });
    if (!scene.anims.exists(walk.animationKey)) {
      scene.anims.create({ key: walk.animationKey, frames, frameRate: 1000 / walk.frameDurationMs, repeat: -1 });
    }
  }
}
