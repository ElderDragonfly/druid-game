"""Cut the uploaded stump without recolouring retained source pixels."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image
from scipy.ndimage import label
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'docs/art/f5420a528a7b5430d756f6ade291bd90.jpg'
out=ROOT/'docs/art/ritual-stump-v1';out.mkdir(exist_ok=True)
original=np.array(Image.open(source).convert('RGB'))
# Neutral white/grey is the reference's background/ground matte. The warm wood,
# black outlines, coloured mushrooms and attached plants retain their RGB.
background=(original.min(2)>65)&(np.ptp(original,axis=2)<38)
components,_=label(~background);counts=np.bincount(components.ravel());counts[0]=0
keep=components==counts.argmax()
rgba=np.dstack([original,keep.astype('uint8')*255]);rgba[~keep]=0
image=Image.fromarray(rgba);box=image.getbbox();box=(box[0]-2,box[1]-2,box[2]+2,box[3]+2)
image=image.crop(box);image.save(out/'stump.png',optimize=True)
metadata={'source':str(source.relative_to(ROOT)),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
 'sourceCrop':box,'width':image.width,'height':image.height,'scale':.25,
 'anchorX':image.width/2,'anchorY':image.height-8,'rgbPreserved':True,'retainedPixels':int(keep.sum())}
(out/'sprite.json').write_text(json.dumps(metadata,indent=2)+'\n')
assert np.array_equal(rgba[:,:,:3][keep],original[keep])
