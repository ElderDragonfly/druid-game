import { entityData } from './entityBalance';
import { BASE_MOVEMENT_SPEED } from './movement';
import source from '../../docs/art/forest-fly-v2/animations.json';
import { WOLF } from './wolf';

export const FOREST_INSECT = {
  id: 'forestInsect',
  get stats() { const d=entityData.forestInsect;return {health:d.health,
    walkSpeed:d.walkSpeed*BASE_MOVEMENT_SPEED,runSpeed:d.runSpeed*BASE_MOVEMENT_SPEED}; },
  get damage() { return entityData.forestInsect.damage; },
  // Shared routing/detection; attack and death timing come from the chosen reel.
  get behavior() { return {...WOLF.behavior,
    attackMs:source.animations.attack.durations.reduce((a,b)=>a+b,0),impactMs:source.attackImpactMs}; },
  body: {width:32,height:18},
  appearance: {scale:1.8},
  flight: {waveAmplitude:54,waveLength:300,peakPauseMs:500,launchHeight:160},
  hitRecoil: {distance:18,flashMs:55,tiltDegrees:9},
  hitDurationMs:260,get deathDurationMs(){return source.animations.death.durations.reduce((a,b)=>a+b,0);},
} as const;
