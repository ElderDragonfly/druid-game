"""Prepare the approved tree states, pixel growth frames and exact source fly.
Run from the repository root. Pillow + NumPy; no external downloads.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
tree=ROOT/'docs/art/cleansing-tree-v1'
tree.mkdir(exist_ok=True)
original=Image.open(ROOT/'docs/art/1365d0f0558fb5103506f29ec1b13334.jpg').convert('RGB')
a=np.array(original);keep=(a.min(2)<220)|(np.ptp(a.astype(int),axis=2)>25)
Image.fromarray(np.dstack((a,keep.astype('uint8')*255))).resize((100,125),Image.Resampling.NEAREST).save(tree/'corrupted.png')
clean=Image.open(tree/'cleansed-source.png').convert('RGBA').resize((100,125),Image.Resampling.NEAREST)
a=np.array(clean);a[:,:,3]=np.where(a[:,:,3]>=128,255,0)
Image.fromarray(a).save(tree/'cleansed.png')

# Generate the discrete growth frames before splitting their ground layers.
import runpy
for script in ('prepare-cleansing-transition.py','split-cleansing-tree-layers.py','prepare-forest-fly.py'):
    runpy.run_path(str(ROOT/'scripts'/script),run_name='__main__')
