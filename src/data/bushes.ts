import art from '../../docs/art/forest-bushes-v2/sprites.json';

export const BUSHES = art.sprites.map(sprite => ({ ...sprite, scale: art.scale }));
export const BUSH_GENERATION = { min: 24, max: 36, gap: 18, edge: 12 } as const;
