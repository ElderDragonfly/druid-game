import Phaser from 'phaser';
import idle from '../../docs/art/skeleton-room-v1/idle.png';
import walk from '../../docs/art/skeleton-room-v1/walk.png';
import attack from '../../docs/art/skeleton-room-v1/attack.png';
import source from '../../docs/art/skeleton-room-v1/animations.json';

export type SkeletonAnimation='idle'|'walk'|'attack';
export const SKELETON_METRICS=source;
export const SKELETON_ART=Object.entries({idle,walk,attack}).map(([name,url])=>({key:`skeleton-${name}`,url}));
export const skeletonDurations=(name:SkeletonAnimation)=>source.animations[name].durations;
export function prepareSkeletonTextures(scene:Phaser.Scene){
  for(const art of SKELETON_ART){
    const texture=scene.textures.get(art.key);
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    skeletonDurations(art.key.replace('skeleton-','') as SkeletonAnimation).forEach((_,i)=>
      texture.add(String(i),0,i*source.width,0,source.width,source.height));
  }
}
