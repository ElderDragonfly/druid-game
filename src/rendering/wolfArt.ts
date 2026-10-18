import Phaser from 'phaser';
import run from '../../docs/art/wolf-v1/wolf-run.png';
import walk from '../../docs/art/wolf-v1/wolf-walk.png';
import idle from '../../docs/art/wolf-v1/wolf-idle.png';
import attackUp from '../../docs/art/wolf-v1/wolf-attack-up.png';
import attackDown from '../../docs/art/wolf-v1/wolf-attack-down.png';
import death from '../../docs/art/wolf-v1/wolf-death.png';
import runShadow from '../../docs/art/wolf-v1/wolf-run-shadow.png';
import walkShadow from '../../docs/art/wolf-v1/wolf-walk-shadow.png';
import idleShadow from '../../docs/art/wolf-v1/wolf-idle-shadow.png';
import attackUpShadow from '../../docs/art/wolf-v1/wolf-attack-up-shadow.png';
import attackDownShadow from '../../docs/art/wolf-v1/wolf-attack-down-shadow.png';
import deathShadow from '../../docs/art/wolf-v1/wolf-death-shadow.png';
import source from '../../docs/art/wolf-v1/animations.json';
import { WOLF } from '../data/wolf';

export type WolfAnimation = 'walk' | 'run' | 'idle' | 'attack-up' | 'attack-down' | 'death';
const sheets = { run, walk, idle, 'attack-up': attackUp, 'attack-down': attackDown, death };
const shadows = { run: runShadow, walk: walkShadow, idle: idleShadow,
  'attack-up': attackUpShadow, 'attack-down': attackDownShadow, death: deathShadow };
export const WOLF_ART = (Object.keys(sheets) as WolfAnimation[]).flatMap(state => [
  { key: `wolf-${state}`, url: sheets[state] }, { key: `wolf-${state}-shadow`, url: shadows[state] },
]);
export const wolfDurations = (state: WolfAnimation): number[] => source.animations[state].durations;
export function prepareWolfTextures(scene: Phaser.Scene) {
  const { frameWidth, frameHeight } = WOLF.appearance;
  for (const art of WOLF_ART) {
    const texture = scene.textures.get(art.key);
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    const state = art.key.replace('wolf-', '').replace('-shadow', '') as WolfAnimation;
    wolfDurations(state).forEach((_, index) => {
      texture.add(String(index), 0, index * frameWidth, 0, frameWidth, frameHeight);
    });
  }
}
