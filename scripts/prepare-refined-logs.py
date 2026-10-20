"""Pack the five refined, shadow-free logs on a common two-world-unit pixel grid.
The v1 art remains archived; mushrooms reuse its original source PNGs.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import label

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/art/fallen-logs-v2'
source=Image.open(OUT/'refined-source.png').convert('RGBA')
data=np.array(source)
regions,n=label(data[:,:,3]>=128,np.ones((3,3)))
sizes=np.bincount(regions.ravel());sizes[0]=0
ids=list(np.argsort(sizes)[-5:])
# Three logs across the upper row, then two across the lower row.
def position(i):
    y,x=np.where(regions==i)
    return (int(y.min())>source.height*.4,int(x.min()))
ids.sort(key=position)
old=json.loads((ROOT/'docs/art/fallen-logs-v1/sprites.json').read_text())
surfaces=[[[14,12],[24,9],[39,10],[39,14],[25,17],[13,18]],[[14,12],[24,9],[39,10],[39,14],[25,17],[13,18]],
 [[9,11],[20,9],[33,6],[36,8],[32,12],[17,16],[9,17]],[[9,11],[20,9],[33,6],[36,8],[32,12],[17,16],[9,17]],
 [[10,8],[17,11],[34,19],[45,20],[48,24],[37,23],[20,16],[9,11]]]
logs=[]
for index,region in enumerate(ids):
    selected=regions==region
    pixels=data.copy();pixels[:,:,3]=selected*255;pixels[~selected]=0
    sprite=Image.fromarray(pixels);bounds=sprite.getbbox();sprite=sprite.crop(bounds)
    ref=old['logs'][index]
    width=round(ref['width']*ref['scale']*(2/3)/2)
    height=round(sprite.height/sprite.width*width)
    sprite=sprite.resize((width,height),Image.Resampling.NEAREST)
    rgba=np.array(sprite);rgba[rgba[:,:,3]==0]=0;sprite=Image.fromarray(rgba)
    sprite.save(OUT/f'log-{index}.png',optimize=True)
    # Keep normalized surface/footprint anchors when moving to the finer grid.
    point=lambda p:[round(p[0]/ref['width']*width,3),round(p[1]/ref['height']*height,3)]
    logs.append({'id':ref['id'],'file':ref['file'],'width':width,'height':height,'scale':2,
      'bodyLine':[point(p) for p in ref['bodyLine']],'bodyRadius':ref['bodyRadius']*2/3,
      'mushroomSpots':[point(p) for p in ref['mushroomSpots']], 'mushroomSurface':surfaces[index],
      'sourceCrop':list(bounds),'previousWorldWidth':ref['width']*ref['scale'],
      'worldPixelSize':2,'shadowFree':True})
(OUT/'sprites.json').write_text(json.dumps({'logs':logs,'sizeMultiplier':2/3,'worldPixelSize':2,
  'source':'refined-source.png','previous':'../fallen-logs-v1/sprites.json'},indent=2)+'\n')
preview=Image.new('RGBA',(720,400),(29,49,35,255));draw=ImageDraw.Draw(preview)
for i,ref in enumerate(logs):
    sprite=Image.open(OUT/ref['file']).convert('RGBA');sprite=sprite.resize((sprite.width*3,sprite.height*3),Image.Resampling.NEAREST)
    x=20+(i%3)*230;y=30+(i//3)*180;preview.alpha_composite(sprite,(x,y));draw.text((x,y-18),ref['id'],fill='white')
preview.convert('RGB').save(OUT/'collection.png')
print([(r['id'],r['width'],r['height'],r['width']*r['scale']) for r in logs])
