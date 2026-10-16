import Phaser from 'phaser';
import standing from '../assets/characters/druid-standing-detail.png';
import basic from '../../docs/art/druid-sprites-v1/druid-04-basic.png';
import campSource from '../../docs/art/druid-detail-preview-v1/character-selection-preview.png';
import idleSource from '../../docs/art/druid-front-refinement-v2/idle-down-256x320.png';
import legacyIdleSource from '../../docs/art/druid-basic-walk-v1/idle-64x80.png';
import walkDownSource from '../../docs/art/druid-front-refinement-v2/walk-down-256x320.png';
import walkUpSource from '../../docs/art/druid-back-refinement-v1/walk-up-256x320.png';
import walkLeftSource from '../../docs/art/druid-basic-walk-v1/walk-left-64x80.png';
import walkRightSource from '../../docs/art/druid-basic-walk-v1/walk-right-64x80.png';
import type { Facing } from '../input/FourWayFacing';

export const DRUID_TEXTURES = {
  standing: 'druid-standing-detail',
  basic: 'druid-basic-detail',
  campSource: 'druid-camp-source', camp: 'druid-camp',
  gameSource: 'druid-game-source', game: 'druid-game',
  leftSource: 'druid-left-source', rightSource: 'druid-right-source', backSource: 'druid-back-source',
  walkDown: 'druid-walk-down-source',
  walkUp: 'druid-walk-up-source',
  walkLeft: 'druid-walk-left-source',
  walkRight: 'druid-walk-right-source',
} as const;

export const DRUID_ART = [
  { key: DRUID_TEXTURES.standing, url: standing, frame: { x: 275, y: 49, width: 745, height: 1129 } },
  { key: DRUID_TEXTURES.basic, url: basic, frame: { x: 270, y: 80, width: 725, height: 1105 } },
  { key: DRUID_TEXTURES.campSource, url: campSource, frame: { x: 840, y: 80, width: 696, height: 864 } },
  { key: DRUID_TEXTURES.gameSource, url: idleSource, frame: { x: 0, y: 0, width: 256, height: 320 } },
  { key: DRUID_TEXTURES.leftSource, url: legacyIdleSource, frame: { x: 128, y: 0, width: 64, height: 80 } },
  { key: DRUID_TEXTURES.rightSource, url: legacyIdleSource, frame: { x: 192, y: 0, width: 64, height: 80 } },
  { key: DRUID_TEXTURES.backSource, url: walkUpSource, frame: { x: 0, y: 0, width: 256, height: 320 } },
  { key: DRUID_TEXTURES.walkDown, url: walkDownSource, frame: { x: 0, y: 0, width: 256, height: 320 } },
  { key: DRUID_TEXTURES.walkUp, url: walkUpSource, frame: { x: 0, y: 0, width: 256, height: 320 } },
  { key: DRUID_TEXTURES.walkLeft, url: walkLeftSource, frame: { x: 0, y: 0, width: 64, height: 80 } },
  { key: DRUID_TEXTURES.walkRight, url: walkRightSource, frame: { x: 0, y: 0, width: 64, height: 80 } },
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
  // Общая сетка сохраняет подробный фронтальный PNG 1:1; размер в мире прежний.
  width: 256, height: 320, scale: 87.5 / 256, feetY: 300,
  bodyWidth: 20, bodyHeight: 25, bodyCenterY: 10,
} as const satisfies GameSpriteMetrics;

interface DruidView {
  direction: Facing;
  sourceKey: string;
  x: number; y: number; width: number; height: number;
  footX: number;
}

// Боковые ракурсы пока прежние: целочисленное ×4 сохраняет их рисунок.
export const DRUID_VIEWS: readonly DruidView[] = [
  { direction: 'down', sourceKey: DRUID_TEXTURES.gameSource, x: 0, y: 0, width: 256, height: 300, footX: 128 },
  { direction: 'left', sourceKey: DRUID_TEXTURES.leftSource, x: 128, y: 0, width: 64, height: 75, footX: 32 },
  { direction: 'right', sourceKey: DRUID_TEXTURES.rightSource, x: 192, y: 0, width: 64, height: 75, footX: 32 },
  { direction: 'up', sourceKey: DRUID_TEXTURES.backSource, x: 0, y: 0, width: 256, height: 300, footX: 128 },
];

// Новые циклы добавляются сюда; отсутствие цикла оставляет неподвижный ракурс.
export const DRUID_WALKS = [
  { direction: 'down', sourceKey: DRUID_TEXTURES.walkDown, animationKey: 'druid-walk-down',
    frameWidth: 256, frameHeight: 320, frameCount: 4, frameDurationMs: 160 },
  { direction: 'up', sourceKey: DRUID_TEXTURES.walkUp, animationKey: 'druid-walk-up',
    frameWidth: 256, frameHeight: 320, frameCount: 4, frameDurationMs: 160 },
  { direction: 'left', sourceKey: DRUID_TEXTURES.walkLeft, animationKey: 'druid-walk-left',
    frameWidth: 64, frameHeight: 80, frameCount: 4, frameDurationMs: 160 },
  { direction: 'right', sourceKey: DRUID_TEXTURES.walkRight, animationKey: 'druid-walk-right',
    frameWidth: 64, frameHeight: 80, frameCount: 4, frameDurationMs: 160 },
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
      const pixelScale = width / view.width;
      const x = frameX + width / 2 - view.footX * pixelScale;
      const y = feetY - view.height * pixelScale;
      // Новый PNG копируется 1:1, прежние — ×4 с NEAREST без новых деталей.
      atlas.context.drawImage(source, view.x, view.y, view.width, view.height,
        x, y, view.width * pixelScale, view.height * pixelScale);
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
    const key = `${walk.sourceKey}-runtime`;
    if (!scene.textures.exists(key)) {
      const source = scene.textures.get(walk.sourceKey).getSourceImage() as HTMLImageElement;
      const atlas = scene.textures.createCanvas(key, GAME_DRUID.width * walk.frameCount, GAME_DRUID.height)!;
      atlas.context.imageSmoothingEnabled = false;
      for (let i = 0; i < walk.frameCount; i++) {
        atlas.context.drawImage(source, i * walk.frameWidth, 0, walk.frameWidth, walk.frameHeight,
          i * GAME_DRUID.width, 0, GAME_DRUID.width, GAME_DRUID.height);
      }
      atlas.refresh().setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    const texture = scene.textures.get(key);
    const frames = Array.from({ length: walk.frameCount }, (_, index) => {
      const frame = `walk-${walk.direction}-${index}`;
      if (!texture.has(frame)) texture.add(frame, 0, index * GAME_DRUID.width, 0, GAME_DRUID.width, GAME_DRUID.height);
      return { key, frame };
    });
    if (!scene.anims.exists(walk.animationKey)) {
      scene.anims.create({ key: walk.animationKey, frames, frameRate: 1000 / walk.frameDurationMs, repeat: -1 });
    }
  }
}
