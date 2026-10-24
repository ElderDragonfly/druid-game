import Phaser from 'phaser';
import central from '../../docs/art/witch-circle-v1/central.png';
import ring from '../../docs/art/witch-circle-v2/ring-atlas.png';
import soil from '../../docs/art/witch-circle-v2/soil.png';
import metadata from '../../docs/art/witch-circle-v2/sprites.json';
import type { FloorRaster } from '../world/forestFloor';
export const WITCH_ART=[{key:'witch-circle-central',url:central},{key:'witch-circle-ring',url:ring},{key:'witch-circle-soil',url:soil}];
export const WITCH_ART_METRICS=metadata;
export function prepareWitchTextures(scene:Phaser.Scene){
  WITCH_ART.forEach(a=>scene.textures.get(a.key).setFilter(Phaser.Textures.FilterMode.NEAREST));
  for(const sprite of metadata.sprites){const f=sprite.frame;scene.textures.get('witch-circle-ring').add(sprite.id,0,f.x,f.y,f.width,f.height);}
}
const soilSamples=new WeakMap<object,FloorRaster>();
export function witchSoilSample(scene:Phaser.Scene):FloorRaster{
  const source=scene.textures.get('witch-circle-soil').getSourceImage();
  const cached=soilSamples.get(source);if(cached)return cached;
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=96;
  const ctx=canvas.getContext('2d')!;ctx.imageSmoothingEnabled=false;ctx.drawImage(source as CanvasImageSource,0,0,128,96);
  const sample={width:128,height:96,pixels:ctx.getImageData(0,0,128,96).data};soilSamples.set(source,sample);return sample;
}
