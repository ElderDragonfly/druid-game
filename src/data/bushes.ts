import art from '../../docs/art/forest-bushes-v2/sprites.json';

export const BUSHES = art.sprites.map(sprite => ({ ...sprite, scale: art.scale / 3 }));
export const BUSH_GENERATION = { min: 24, max: 36, roomId: 3, gap: 18, edge: 12 } as const;
