import { CAMP_DRUID, DRUID_TEXTURES, GAME_DRUID, type GameSpriteMetrics } from '../rendering/druidArt';

export interface CharacterDefinition {
  id: string;
  name: string;
  available: boolean;
  description: string;
  portrait: { texture: string; frame?: string };
  camp?: { texture: string; originX: number; originY: number; scale: number };
  game?: { texture: string; metrics: GameSpriteMetrics };
}

// Порядок массива определяет порядок ячеек; новые персонажи добавляются здесь.
export const CHARACTERS: readonly CharacterDefinition[] = [
  {
    id: 'druid', name: 'Друид', available: true, description: 'Природная магия · 3 HP',
    portrait: { texture: DRUID_TEXTURES.standing, frame: 'figure' },
    camp: { texture: DRUID_TEXTURES.camp, originX: 0.5, originY: CAMP_DRUID.seatOriginY, scale: CAMP_DRUID.scale },
    game: { texture: DRUID_TEXTURES.game, metrics: GAME_DRUID },
  },
  { id: 'locked-1', name: 'Закрыто', available: false, description: 'Пока недоступен', portrait: { texture: DRUID_TEXTURES.standing, frame: 'figure' } },
  { id: 'locked-2', name: 'Закрыто', available: false, description: 'Пока недоступен', portrait: { texture: DRUID_TEXTURES.standing, frame: 'figure' } },
];
