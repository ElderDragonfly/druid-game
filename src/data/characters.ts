import { DRUID_HIT_APPEARANCE } from '../rendering/druidHitArt';
import { BASE_MOVEMENT_SPEED } from './movement';
import { CAMP_DRUID, DRUID_TEXTURES, DRUID_WALK_ANIMATIONS, GAME_DRUID, type GameSpriteMetrics } from '../rendering/druidArt';
import type { Facing } from '../input/EightWayFacing';
import { DRUID_CAST_APPEARANCE } from '../rendering/druidCastArt';

export interface CharacterDefinition {
  id: string;
  name: string;
  available: boolean;
  description: string;
  stats?: { health: number; speed: number; walkReferenceSpeed: number };
  portrait: { texture: string; frame?: string };
  camp?: { props?: readonly { texture: string; position?: { x: number; y: number };
    originX?: number; originY?: number; scale?: number; angle?: number }[]; texture: string; originX: number; originY: number; scale: number; position?: { x: number; y: number } };
  game?: { texture: string; metrics: GameSpriteMetrics; frames?: Record<Facing, string>;
    walkAnimations?: Partial<Record<Facing, string>>;
    hits?: Partial<Record<Facing, { texture: string; frames: string[] }>>;
    casts?: Partial<Record<Facing, { texture: string; frames: string[] }>> };
}

// Порядок массива определяет порядок ячеек; новые персонажи добавляются здесь.
export const CHARACTERS: readonly CharacterDefinition[] = [
  {
    stats: { health: 3, speed: BASE_MOVEMENT_SPEED, walkReferenceSpeed: 220 },
    id: 'druid', name: 'Друид', available: true, description: 'Природная магия · 3 HP',
    portrait: { texture: DRUID_TEXTURES.basic, frame: 'figure' },
    camp: { texture: DRUID_TEXTURES.camp, originX: 0, originY: 0, scale: CAMP_DRUID.scale, position: CAMP_DRUID.position,
      // Align the original branch with the user's red placement guide.
      // Pivot at the lower end; a small size adjustment keeps the fork on screen.
      props: [{ texture: DRUID_TEXTURES.campStaff, originX: 280 / 696, originY: 800 / 864, angle: -32,
        scale: CAMP_DRUID.scale * .94,
        position: { x: CAMP_DRUID.position.x + 420 * CAMP_DRUID.scale,
          y: CAMP_DRUID.position.y + 746 * CAMP_DRUID.scale } }] },
    game: { texture: DRUID_TEXTURES.game, metrics: GAME_DRUID,
      frames: { up: 'up', down: 'down', left: 'left', right: 'right',
        'down-left': 'down-left', 'down-right': 'down-right', 'up-left': 'up-left', 'up-right': 'up-right' },
      walkAnimations: DRUID_WALK_ANIMATIONS, hits: DRUID_HIT_APPEARANCE, casts: DRUID_CAST_APPEARANCE },
  },
  { id: 'locked-1', name: 'Закрыто', available: false, description: 'Пока недоступен', portrait: { texture: DRUID_TEXTURES.standing, frame: 'figure' } },
  { id: 'locked-2', name: 'Закрыто', available: false, description: 'Пока недоступен', portrait: { texture: DRUID_TEXTURES.standing, frame: 'figure' } },
];
