import art from '../../docs/art/forest-bushes-v2/sprites.json';
import { WITCH_CIRCLE } from './witchCircle';

export const BUSH_SIZE_MULTIPLIER = 1.75;
export const ACTIVE_BUSH_VARIANT = 2;
export const BUSH_RUSTLE = { frames: 6, width: 102, height: 75, cropX: 13, cropY: 33, cell: 128 } as const;
// Retired metrics remain readable by old saves. Only variant 2 is generated.
export const BUSHES = art.sprites.map((sprite,index) => index===ACTIVE_BUSH_VARIANT
  ? {...sprite,width:102,height:75,anchorX:51,anchorY:74,
    scale:86/75*art.scale/3*BUSH_SIZE_MULTIPLIER,frame:{x:13,y:33,width:102,height:75}}
  : {...sprite,scale:art.scale/3*BUSH_SIZE_MULTIPLIER});
export const BUSH_GENERATION = { min: 24, max: 36, roomId: WITCH_CIRCLE.roomId, gap: 8, edge: 12 } as const;
