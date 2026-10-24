"""Cut the user's amanita references without repainting or recoloring."""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_propagation, label

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/witch-circle-v1'
OUT.mkdir(exist_ok=True)
SMALL = ROOT / 'docs/art/76c2b537db5e76dd2a71bbae16fe2efc.jpg'
LARGE = ROOT / 'docs/art/3aaf750541e7c159c68cc3a6dcb5b811.jpg'

def cut(path, crop, background, tolerance):
    rgb = np.array(Image.open(path).convert('RGB').crop(crop))
    candidate = np.linalg.norm(rgb.astype(float) - np.array(background), axis=2) <= tolerance
    if path == SMALL:
        # JPEG ringing around the beige background is lighter than the backdrop.
        # Flood only the exterior neutral fringe; enclosed pale cap spots remain.
        candidate |= (rgb.max(axis=2).astype(int)-rgb.min(axis=2) < 28) & (rgb.min(axis=2)>175)
    edge = np.zeros(candidate.shape, dtype=bool)
    edge[0] = candidate[0]; edge[-1] = candidate[-1]
    edge[:, 0] = candidate[:, 0]; edge[:, -1] = candidate[:, -1]
    mask = ~binary_propagation(edge, mask=candidate)
    components, _ = label(mask)
    sizes = np.bincount(components.ravel()); sizes[0] = 0
    mask &= sizes[components] >= 12
    yy, xx = np.where(mask)
    bounds = (int(xx.min()), int(yy.min()), int(xx.max())+1, int(yy.max())+1)
    x0,y0,x1,y1 = bounds
    rgba = np.dstack((rgb, mask.astype('uint8')*255))[y0:y1, x0:x1]
    rgba[rgba[:,:,3]==0] = 0
    return Image.fromarray(rgba), [crop[0]+x0,crop[1]+y0,crop[0]+x1,crop[1]+y1]

sprites=[]; atlas=Image.new('RGBA',(320,96)); preview=Image.new('RGB',(600,240),'#293e2e')
for index,crop in enumerate([(50,62,115,143),(115,62,176,143),(176,72,242,143),(240,64,308,143)]):
    im,bounds=cut(SMALL,crop,[238,236,223],10)
    im.save(OUT/f'ring-{index}.png'); atlas.paste(im,(index*80,0))
    sprites.append({'id':f'ring-{index}','width':im.width,'height':im.height,
                    'anchorX':im.width//2,'anchorY':im.height-1,'sourceCrop':bounds,
                    'frame':{'x':index*80,'y':0,'width':im.width,'height':im.height}})
    shown=im.resize((im.width*2,im.height*2),Image.Resampling.NEAREST)
    preview.paste(shown,(index*120+(120-shown.width)//2,160-shown.height),shown)
central,bounds=cut(LARGE,(180,25,875,940),[255,255,255],20)
central.save(OUT/'central.png')
shown=central.copy(); shown.thumbnail((110,190),Image.Resampling.NEAREST)
preview.paste(shown,(490+(110-shown.width)//2,200-shown.height),shown)
ImageDraw.Draw(preview).text((14,215),'1       2       3       4       center',fill='#d2d6ad')
preview.save(OUT/'collection.png'); atlas.save(OUT/'ring-atlas.png')
(OUT/'sprites.json').write_text(json.dumps({'sourceRing':str(SMALL.relative_to(ROOT)),
    'sourceCentral':str(LARGE.relative_to(ROOT)),'preservesOpaqueRGB':True,'sprites':sprites,
    'central':{'width':central.width,'height':central.height,'anchorX':central.width//2,
               'anchorY':central.height-1,'sourceCrop':bounds}},indent=2)+'\n')
print('Prepared four ring amanitas and the full central composition; source RGB retained.')
