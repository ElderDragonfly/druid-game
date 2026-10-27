import Phaser from 'phaser';
import art from '../../docs/art/sprouts-rocks-v1/art.json';
const urls=import.meta.glob('/docs/art/sprouts-rocks-v1/*.png',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const url=(name:string)=>urls[`/docs/art/sprouts-rocks-v1/${name}.png`];
export const ROCK_ART=art.rocks.map((metrics,i)=>({key:`grove-rock-${i}`,url:url(`rock-${i}`),metrics}));
export const SPROUT_ART=art.sprouts.map((metrics,i)=>({key:`sprout-${i}`,url:url(`sprout-${i}`),metrics}));
export const PLANT_ART=art.sprouts.map((metrics,i)=>({key:`sprout-plant-${i}`,url:url(`plant-${i}`),metrics}));
export const SPROUT_ROCK_ART=[...ROCK_ART,...SPROUT_ART,...PLANT_ART];
export function prepareSproutRockTextures(scene:Phaser.Scene){
  SPROUT_ROCK_ART.forEach(a=>scene.textures.get(a.key).setFilter(Phaser.Textures.FilterMode.NEAREST));
}
