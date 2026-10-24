import art from '../../docs/art/forest-bushes-v2/sprites.json';
import { WITCH_CIRCLE } from './witchCircle';

export const BUSH_SIZE_MULTIPLIER = 1.75;
export const BUSHES = art.sprites.map(sprite => ({ ...sprite,
  scale: art.scale / 3 * BUSH_SIZE_MULTIPLIER }));
export const BUSH_GENERATION = { min: 24, max: 36, roomId: WITCH_CIRCLE.roomId, gap: 8, edge: 12 } as const;
