import Phaser from 'phaser';
import acorn from '../../docs/art/acorn-projectile-v1/acorn.png';
import leaves from '../../docs/art/acorn-projectile-v1/leaves.png';

export const ACORN_ART = [{key:'acorn',url:acorn},{key:'acorn-leaves',url:leaves}];
export function prepareAcornTextures(scene: Phaser.Scene) {
  for(const art of ACORN_ART) scene.textures.get(art.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  const texture=scene.textures.get('acorn-leaves');
  for(let i=0;i<5;i++) if(!texture.has(String(i))) texture.add(String(i),0,i*24,0,24,24);
}
