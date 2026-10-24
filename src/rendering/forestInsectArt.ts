import Phaser from 'phaser';
import source from '../../docs/art/forest-fly-v2/animations.json';
import shadow from '../../docs/art/forest-fly-v2/shadow.png';
const urls=import.meta.glob<string>('../../docs/art/forest-fly-v2/*.png',{eager:true,query:'?url',import:'default'});
export type InsectDirection='left'|'right';
export type InsectAnimation=keyof typeof source.animations;
export const INSECT_METRICS={width:source.frameWidth,height:source.frameHeight,feetX:source.feetX,feetY:source.feetY};
export const INSECT_ART=[...Object.keys(source.animations).map(name=>({key:`insect-${name}`,
  url:urls[`../../docs/art/forest-fly-v2/${name}.png`]!})),{key:'insect-shadow',url:shadow}];
export function insectDurations(animation:InsectAnimation){return source.animations[animation].durations;}
export function prepareInsectTextures(scene:Phaser.Scene) {
  for(const art of INSECT_ART) {
    const texture=scene.textures.get(art.key);texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    if(art.key==='insect-shadow')continue;
    const animation=art.key.replace('insect-','') as InsectAnimation;
    insectDurations(animation).forEach((_,n)=>texture.add(String(n),0,n*source.frameWidth,0,source.frameWidth,source.frameHeight));
  }
}
