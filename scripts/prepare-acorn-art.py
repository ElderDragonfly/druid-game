"""Cut uploaded JPEG pixel-art references; preserve their colours with NEAREST."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import label

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/art/acorn-projectile-v1'
OUT.mkdir(parents=True,exist_ok=True)


def isolate(image,keep):
    data=np.array(image.convert('RGBA'));data[:,:,3]=keep*255;data[~keep]=0
    result=Image.fromarray(data);return result.crop(result.getbbox())


acorn=Image.open(ROOT/'b0471cf9c8dc3eb7b35d9a87be4f3108.jpg').convert('RGBA')
crop=acorn.crop((95,85,410,415));data=np.array(crop)
mask=data[:,:,:3].min(axis=2)<180
components,_=label(mask,np.ones((3,3)));sizes=np.bincount(components.ravel());sizes[0]=0
selected=components==sizes.argmax();ys,xs=np.where(selected)
sprite=isolate(crop,selected)
ratio=.1;size=(round(sprite.width*ratio),round(sprite.height*ratio))
sprite=sprite.resize(size,Image.Resampling.NEAREST)
# Rotate around the nut itself, rather than the leaf attached to its cap.
pivot=(round((210-(95+xs.min()))*ratio),round((300-(85+ys.min()))*ratio))
canvas=Image.new('RGBA',(48,48));canvas.paste(sprite,(24-pivot[0],24-pivot[1]))
canvas.save(OUT/'acorn.png',optimize=True)

leaves=Image.open(ROOT/'f1f06bf5b8e7b1ba529cc56edb76e50d.jpg').convert('RGBA')
data=np.array(leaves);components,_=label(data[:,:,:3].min(axis=2)<180,np.ones((3,3)))
sizes=np.bincount(components.ravel());sizes[0]=0
ids=sorted(np.argsort(sizes)[-5:],key=lambda i:np.where(components==i)[0].min())
atlas=Image.new('RGBA',(24*5,24))
for index,component in enumerate(ids):
    assert sizes[component]>1000
    leaf=isolate(leaves,components==component)
    scale=18/max(leaf.size)
    leaf=leaf.resize((round(leaf.width*scale),round(leaf.height*scale)),Image.Resampling.NEAREST)
    atlas.paste(leaf,(index*24+(24-leaf.width)//2,(24-leaf.height)//2))
atlas.save(OUT/'leaves.png',optimize=True)
(OUT/'art.json').write_text(json.dumps({'acornSource':'b0471cf9c8dc3eb7b35d9a87be4f3108.jpg',
  'leavesSource':'f1f06bf5b8e7b1ba529cc56edb76e50d.jpg','airReferenceNotUsed':'dfe996a6fca1d0c3904369d92fea5cc3.jpg',
  'acornFrame':[48,48],'acornPivot':[24,24],'leafFrames':5,'leafFrame':[24,24],
  'method':'Connected components remove white backdrop; NEAREST normalization, no palette changes'},indent=2)+'\n')
