"""Remove only the beige JPEG matte on the outer caps of two violet mushrooms.
Keep white stems, red-cap dots, pale mint outlines and all retained RGB exact.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_fill_holes, distance_transform_edt
ROOT=Path(__file__).resolve().parents[1]
OLD=ROOT/'docs/art/fallen-logs-v1'
OUT=ROOT/'docs/art/log-mushrooms-v2'
OUT.mkdir(exist_ok=True)
original=json.loads((OLD/'sprites.json').read_text())
report=[]
for index,art in enumerate(original['mushrooms']):
 data=np.array(Image.open(OLD/art['file']).convert('RGBA'))
 opaque=data[:,:,3]>0
 exterior=~binary_fill_holes(np.pad(opaque,1))[1:-1,1:-1]
 distance=distance_transform_edt(np.pad(~exterior,1))[1:-1,1:-1]
 rgb=data[:,:,:3].astype(float)
 yy,xx=np.indices(opaque.shape)
 remove=np.zeros_like(opaque)
 if index in (2,4):
  pale=(np.ptp(rgb,axis=2)<55)&(rgb.mean(2)>140)
  cap=yy<(32 if index==2 else 40)
  remove=opaque&pale&cap&(distance<=3)
 data[:,:,3][remove]=0
 # RGB is preserved even beneath alpha, so reverting the mask is lossless.
 Image.fromarray(data).save(OUT/art['file'],optimize=True)
 Image.fromarray(remove.astype('uint8')*255).save(OUT/f"{art['id']}-removed.png")
 art['originalRetainedPixels']=art['retainedPixels']
 art['retainedPixels']=int((data[:,:,3]>0).sum())
 report.append({'id':art['id'],'removed':int(remove.sum()),'capOnly':index in (2,4),'maxExteriorDepth':3})
(OUT/'sprites.json').write_text(json.dumps({'mushrooms':original['mushrooms'],'cleanup':report},ensure_ascii=False,indent=2)+'\n')
preview=Image.new('RGB',(1000,200),(34,61,41));draw=ImageDraw.Draw(preview)
for index,art in enumerate(original['mushrooms']):
 sprite=Image.open(OUT/art['file']);sprite=sprite.resize((sprite.width*2,sprite.height*2),Image.Resampling.NEAREST)
 x=10+index*140;preview.paste(sprite,(x,25),sprite);draw.text((x,5),art['id'],fill='white')
preview.save(OUT/'collection.png')
print(report)
