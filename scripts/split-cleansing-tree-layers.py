"""Split only the green ground patch; preserve every original RGBA pixel."""
from pathlib import Path
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parents[1]/'docs/art/cleansing-tree-v1'
for state in ('corrupted','cleansed',*(f'transition-{i}' for i in range(1,7))):
    original=np.array(Image.open(root/(state+'.png')).convert('RGBA'))
    y=np.indices(original.shape[:2])[0]
    rgb=original[:,:,:3].astype(int)
    grass=(y>=104)&(original[:,:,3]>0)&(rgb[:,:,1]>rgb[:,:,0])&(rgb[:,:,1]>rgb[:,:,2])
    ground=original.copy();wood=original.copy()
    ground[~grass]=0;wood[grass]=0
    assert np.array_equal(original,ground+wood)
    assert not np.any((ground[:,:,3]>0)&(wood[:,:,3]>0))
    Image.fromarray(ground).save(root/(state+'-ground.png'))
    Image.fromarray(wood).save(root/(state+'-wood.png'))
    print(state, ':',int(grass.sum()),'ground pixels moved to separate layer; original unchanged')
