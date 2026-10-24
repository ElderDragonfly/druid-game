import art from '../../docs/art/forest-bushes-v2/sprites.json';

export const BUSH_SIZE_MULTIPLIER = 1.75;
// Native lower-leaf footprints, excluding transparent source margins.
const bodies = [
  { x: 52, y: 68, width: 68, height: 18 }, { x: 41, y: 47, width: 50, height: 16 },
  { x: 22, y: 67, width: 68, height: 18 }, { x: 28, y: 96, width: 88, height: 22 },
  { x: 36, y: 61, width: 58, height: 18 }, { x: 43, y: 38, width: 54, height: 16 },
  { x: 46, y: 41, width: 58, height: 16 }, { x: 53, y: 67, width: 68, height: 18 },
] as const;
export const BUSHES = art.sprites.map((sprite, index) => ({ ...sprite,
  scale: art.scale / 3 * BUSH_SIZE_MULTIPLIER, body: bodies[index]! }));
export const BUSH_GENERATION = { min: 24, max: 36, roomId: 3, gap: 18, edge: 12 } as const;
