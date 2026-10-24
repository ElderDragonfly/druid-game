import Phaser from 'phaser';
import source from '../../docs/art/bear-game-v1/animations.json';
const urls=import.meta.glob<string>('../../docs/art/bear-game-v1/*.png',{eager:true,query:'?url',import:'default'});
export type BearAnimation=keyof typeof source.animations;
export type BearAttack='swipe'|'bite'|'slam';
export type BearFacing='left'|'right';
export const BEAR_ATTACKS:readonly BearAttack[]=['swipe','bite','slam'];
export const BEAR_METRICS={width:source.frameWidth,height:source.frameHeight,feetX:source.feetX,feetY:source.feetY};
export const BEAR_ART=Object.keys(source.animations).flatMap(animation=>['left','right'].map(direction=>({
  key:`bear-${animation}-${direction}`,url:urls[`../../docs/art/bear-game-v1/${animation}-${direction}.png`]!,
})));
export function bearDurations(animation:BearAnimation){return source.animations[animation].durations;}
export function bearDuration(animation:BearAnimation){return bearDurations(animation).reduce((a,b)=>a+b,0);}
export function bearImpact(attack:BearAttack){return source.animations[attack].impactMs;}
export function bearFrame(animation:BearAnimation,elapsed:number){
 const durations=bearDurations(animation);let n=0;
 while(n<durations.length-1&&elapsed>=durations[n])elapsed-=durations[n++];return n;
}
export function prepareBearTextures(scene:Phaser.Scene){
 for(const art of BEAR_ART){const texture=scene.textures.get(art.key);texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  const animation=art.key.slice(5,art.key.lastIndexOf('-')) as BearAnimation;
  bearDurations(animation).forEach((_,n)=>texture.add(String(n),0,n*source.frameWidth,0,source.frameWidth,source.frameHeight));
 }
}
