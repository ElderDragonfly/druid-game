import { CAMP_DRUID, DRUID_TEXTURES, DRUID_WALK_ANIMATIONS, GAME_DRUID, type GameSpriteMetrics } from '../rendering/druidArt';
import type { Facing } from '../input/EightWayFacing';

export interface CharacterDefinition {
  id: string;
  name: string;
  available: boolean;
  description: string;
  stats?: { health: number; speed: number; walkReferenceSpeed: number };
  portrait: { texture: string; frame?: string };
  camp?: { texture: string; originX: number; originY: number; scale: number; position?: { x: number; y: number } };
  game?: { texture: string; metrics: GameSpriteMetrics; frames?: Record<Facing, string>;
    walkAnimations?: Partial<Record<Facing, string>> };
}

// Порядок массива определяет порядок ячеек; новые персонажи добавляются здесь.
export const CHARACTERS: readonly CharacterDefinition[] = [
  {
    stats: { health: 3, speed: 220 * 2 / 3, walkReferenceSpeed: 220 },
    id: 'druid', name: 'Друид', available: true, description: 'Природная магия · 3 HP',
    portrait: { texture: DRUID_TEXTURES.basic, frame: 'figure' },
    camp: { texture: DRUID_TEXTURES.camp, originX: 0, originY: 0, scale: CAMP_DRUID.scale, position: CAMP_DRUID.position },
    game: { texture: DRUID_TEXTURES.game, metrics: GAME_DRUID,
      frames: { up: 'up', down: 'down', left: 'left', right: 'right',
        'down-left': 'down-left', 'down-right': 'down-right', 'up-left': 'up-left', 'up-right': 'up-right' }, walkAnimations: DRUID_WALK_ANIMATIONS },
  },
  { id: 'locked-1', name: 'Закрыто', available: false, description: 'Пока недоступен', portrait: { texture: DRUID_TEXTURES.standing, frame: 'figure' } },
  { id: 'locked-2', name: 'Закрыто', available: false, description: 'Пока недоступен', portrait: { texture: DRUID_TEXTURES.standing, frame: 'figure' } },
];
