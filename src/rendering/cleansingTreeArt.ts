import corrupted from '../../docs/art/cleansing-tree-v1/corrupted-wood.png';
import cleansed from '../../docs/art/cleansing-tree-v1/cleansed-wood.png';
import corruptedGround from '../../docs/art/cleansing-tree-v1/corrupted-ground.png';
import cleansedGround from '../../docs/art/cleansing-tree-v1/cleansed-ground.png';
const urls=import.meta.glob<string>('../../docs/art/cleansing-tree-v1/transition-*-*.png',{eager:true,query:'?url',import:'default'});
export const CLEANSING_GROWTH={frames:8,frameMs:200,durationMs:1400} as const;
export const CLEANSING_TREE_ART=[{key:'ritual-tree-corrupted',url:corrupted},{key:'ritual-tree-cleansed',url:cleansed},
  {key:'ritual-tree-corrupted-ground',url:corruptedGround},{key:'ritual-tree-cleansed-ground',url:cleansedGround},
  ...Array.from({length:6},(_,n)=>n+1).flatMap(n=>['wood','ground'].map(layer=>({
    key:`ritual-tree-transition-${n}${layer==='ground'?'-ground':''}`,
    url:urls[`../../docs/art/cleansing-tree-v1/transition-${n}-${layer}.png`]!,
  })))];
export const CLEANSING_TREE_METRICS={width:100,height:125,anchorX:50,anchorY:124,scale:2} as const;
