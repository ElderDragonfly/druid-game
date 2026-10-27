"""Extract user references without recoloring or erasing enclosed pixels."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import binary_fill_holes, label

ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'docs/art'; OUT=ART/'sprouts-rocks-v1'; OUT.mkdir(exist_ok=True)

def extract(source,box,colors,tolerance):
    rgb=np.array(source.crop(box).convert('RGB')); a=rgb.astype(int)
    bg=np.min([np.max(abs(a-np.array(c)),2) for c in colors],axis=0)<=tolerance
    mask=~bg
    labels,_=label(mask);sizes=np.bincount(labels.ravel());sizes[0]=0
    mask=np.isin(labels,np.flatnonzero(sizes>max(40,sizes.max()*.025)))
    mask=binary_fill_holes(mask)
    frame=Image.fromarray(np.dstack((rgb,mask.astype('uint8')*255)))
    bounds=frame.getbbox();frame=frame.crop(bounds)
    return frame,{'sourceCrop':[box[0]+bounds[0],box[1]+bounds[1],box[0]+bounds[2],box[1]+bounds[3]],
                  'width':frame.width,'height':frame.height}

rock=Image.open(ART/'162e3c85cb956a7c83640f8a76e839f2.jpg');rocks=[]
for i in range(9):
    x=112+i%3*225;y=112+i//3*225
    # Some rock highlights equal the other checkerboard color exactly.
    # Remove only this cell's actual background, never both colors together.
    color=(84,112,116) if (i%3+i//3)%2==0 else (132,154,152)
    frame,meta=extract(rock,(x,y,x+225,y+225),[color],20)
    frame.save(OUT/f'rock-{i}.png');rocks.append(meta)

sprout=Image.open(ART/'527076caeb6d25f73cacfbb20a55c730.jpg');sprites=[]
for i,box in enumerate([(20,55,274,372),(280,170,410,372),(428,132,570,372),(580,220,724,372)]):
    frame,meta=extract(sprout,box,[(78,83,117),(60,64,91)],22)
    a=np.array(frame);rgb=a[:,:,:3].astype(int)
    # A separate plant layer is used only for the underground pose.
    plant=(a[:,:,3]>0)&(rgb[:,:,1]>rgb[:,:,0]*1.3)&(rgb[:,:,1]>60)
    plant=binary_fill_holes(plant)
    a[:,:,3]=plant.astype('uint8')*255
    Image.fromarray(a).save(OUT/f'plant-{i}.png');frame.save(OUT/f'sprout-{i}.png')
    meta['plantBaseY']=int(np.nonzero(plant)[0].max())
    meta['scale']=(64 if i==0 else 44)/frame.width
    sprites.append(meta)
(OUT/'art.json').write_text(json.dumps({'exteriorOnly':True,'preservesOpaqueRGB':True,
    'rocks':rocks,'sprouts':sprites},indent=2)+'\n')
print(json.dumps({'rocks':rocks,'sprouts':sprites}))
