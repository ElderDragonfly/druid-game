"""Cut the user's amanita references without repainting or recoloring."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import binary_propagation, label

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/witch-circle-v1'
OUT.mkdir(exist_ok=True)
LARGE = ROOT / 'docs/art/3aaf750541e7c159c68cc3a6dcb5b811.jpg'

def cut(path, crop, background, tolerance):
    rgb = np.array(Image.open(path).convert('RGB').crop(crop))
    candidate = np.linalg.norm(rgb.astype(float) - np.array(background), axis=2) <= tolerance
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

central,bounds=cut(LARGE,(180,25,875,940),[255,255,255],20)
central.save(OUT/'central.png')
(OUT/'sprites.json').write_text(json.dumps({'sourceCentral':str(LARGE.relative_to(ROOT)),
    'preservesOpaqueRGB':True,'central':{'width':central.width,'height':central.height,
    'anchorX':central.width//2,'anchorY':central.height-1,'sourceCrop':bounds}},indent=2)+'\n')
print('Prepared the unchanged central composition; rejected small sprites are not recreated.')
