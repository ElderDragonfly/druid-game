import Phaser from 'phaser';
import central from '../../docs/art/witch-circle-v1/central.png';
import ring from '../../docs/art/witch-circle-v1/ring-atlas.png';
import metadata from '../../docs/art/witch-circle-v1/sprites.json';
export const WITCH_ART=[{key:'witch-circle-central',url:central},{key:'witch-circle-ring',url:ring}];
export const WITCH_ART_METRICS=metadata;
export function prepareWitchTextures(scene:Phaser.Scene){
  WITCH_ART.forEach(a=>scene.textures.get(a.key).setFilter(Phaser.Textures.FilterMode.NEAREST));
  for(const sprite of metadata.sprites){const f=sprite.frame;scene.textures.get('witch-circle-ring').add(sprite.id,0,f.x,f.y,f.width,f.height);}
}
