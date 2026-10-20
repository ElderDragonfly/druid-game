"""Mechanically crop the user's two log JPEGs. Preserve all retained RGB pixels."""
from pathlib import Path
import json
import hashlib
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import label, binary_opening

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/fallen-logs-v1'
OUT.mkdir(exist_ok=True)
SOURCES = {
 'logs': ROOT/'docs/art/27935983a1221547afe93ab842633fc4.jpg',
 'trunk': ROOT/'docs/art/e61f996047ae8b58748b8ca5559c9323.jpg',
}

def cut(source, box, name, mode):
    original = Image.open(SOURCES[source]).convert('RGB')
    rgb = np.array(original.crop(box))
    pixels = rgb.astype(float)
    if mode == 'checker':
        background = (pixels.max(axis=2)-pixels.min(axis=2)<24)&(pixels.mean(axis=2)>=145)
    else:
        border = np.concatenate((pixels[0],pixels[-1],pixels[:,0],pixels[:,-1]))
        base = np.median(border,axis=0)
        background = np.linalg.norm(pixels-base,axis=2)<(32 if source=='logs' else 24)
    if source == 'logs':
        # Grey JPEG ringing around the dark outline is backdrop, not wood.
        background |= (pixels.max(axis=2)-pixels.min(axis=2)<30)&(pixels.mean(axis=2)>110)
    silhouette = binary_opening(~background, np.ones((3,3)))
    components, count = label(silhouette, np.ones((3,3)))
    sizes = np.bincount(components.ravel()); sizes[0] = 0
    # Retain every substantial connected part; discard detached JPEG ringing.
    keep = sizes[components]>= 32
    rgba = np.dstack((rgb, keep.astype('uint8')*255))
    image = Image.fromarray(rgba)
    bounds = image.getbbox(); image = image.crop(bounds)
    result = np.array(image); retained = result[:,:,3]>0
    expected = np.array(original.crop((box[0]+bounds[0],box[1]+bounds[1],box[0]+bounds[2],box[1]+bounds[3])))
    assert np.array_equal(result[:,:,:3][retained], expected[retained])
    image.save(OUT/f'{name}.png', optimize=True)
    return {'id':name,'file':f'{name}.png','width':image.width,'height':image.height,
      'source':str(SOURCES[source].relative_to(ROOT)),
      'sourceCrop':[box[0]+bounds[0],box[1]+bounds[1],box[0]+bounds[2],box[1]+bounds[3]],
      'retainedPixels':int(retained.sum()),'rgbPreserved':True}

logs=[]
for i,box in enumerate([(120,270,480,475),(540,270,900,475),(80,530,490,710),(520,530,930,710)]):
    logs.append(cut('logs',box,f'log-{i}','flat'))
logs.append(cut('trunk',(150,260,810,700),'log-4','checker'))
# Relative positions in each cut PNG: centerline footprint and growing surface.
for item,scale,line,radius,spots in zip(logs,[.45,.45,.4,.4,.3],
 [((40,140),(290,100)),((40,140),(290,100)),((45,120),(315,85)),((45,120),(315,85)),((85,135),(510,310))],
 [10,10,8,8,12],
 [[(100,85),(175,60),(245,50)],[(100,85),(175,60),(245,50)],
  [(95,85),(190,65),(270,55)],[(95,85),(190,65),(270,55)],[(150,125),(295,185),(425,235)]]):
    item.update(scale=scale,bodyLine=line,bodyRadius=radius,mushroomSpots=spots)
metadata={'logs':logs,'sourceHashes':{k:hashlib.sha256(p.read_bytes()).hexdigest() for k,p in SOURCES.items()}}
(OUT/'sprites.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
# Local inspection only; game loads independent transparent sprites.
preview=Image.new('RGB',(1000,640),(39,61,47));d=ImageDraw.Draw(preview)
for i,item in enumerate(logs):
    im=Image.open(OUT/item['file']);im.thumbnail((300,210),Image.Resampling.NEAREST)
    x=20+(i%3)*325;y=30+(i//3)*240
    preview.paste(im,(x,y),im);d.text((x,y-16),item['id'],fill='white')
preview.save(OUT/'collection.png')
print([(x['id'],x['width'],x['height']) for x in logs])
