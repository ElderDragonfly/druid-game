"""Exterior-only mushroom crop and a short synthesized pickup chime."""
from pathlib import Path
import json,wave
import numpy as np
from PIL import Image
from scipy.ndimage import binary_propagation,binary_fill_holes,label
root=Path(__file__).resolve().parents[1];out=root/'docs/art/mushroom-pickup-v1';out.mkdir(exist_ok=True)
source=root/'docs/art/63fb1f7cb8d18a0ed6781a20e964d1c7.jpg';crop=[900,80,1130,290]
rgb=np.array(Image.open(source).convert('RGB').crop(crop));candidate=np.linalg.norm(rgb.astype(float)-[67,67,67],axis=2)<=20
edge=np.zeros(candidate.shape,dtype=bool);edge[0]=candidate[0];edge[-1]=candidate[-1];edge[:,0]=candidate[:,0];edge[:,-1]=candidate[:,-1]
mask=~binary_propagation(edge,mask=candidate)
components,_=label(mask);sizes=np.bincount(components.ravel());sizes[0]=0;mask=components==sizes.argmax()
mask=binary_fill_holes(mask) # Exterior cut only: every enclosed pixel remains opaque.
yy,xx=np.where(mask);bounds=[int(xx.min()),int(yy.min()),int(xx.max())+1,int(yy.max())+1]
x0,y0,x1,y1=bounds;rgba=np.dstack([rgb,mask.astype('uint8')*255])[y0:y1,x0:x1];rgba[rgba[:,:,3]==0]=0
Image.fromarray(rgba).save(out/'mushroom.png')
metadata={'source':str(source.relative_to(root)),'sourceCrop':[crop[0]+x0,crop[1]+y0,crop[0]+x1,crop[1]+y1],
'width':x1-x0,'height':y1-y0,'preservesOpaqueRGB':True,'exteriorOnly':True}
(out/'art.json').write_text(json.dumps(metadata,indent=2)+'\n')
assert np.array_equal(rgba[:,:,:3][rgba[:,:,3]>0],rgb[y0:y1,x0:x1][rgba[:,:,3]>0])
assert np.array_equal(binary_fill_holes(rgba[:,:,3]>0),rgba[:,:,3]>0)
audio=root/'docs/audio/pickup-chime-v1';audio.mkdir(exist_ok=True)
rate=44100;t=np.arange(int(rate*.32))/rate
sound=np.zeros_like(t)
for offset,freq,gain in [(0,880,.32),(.065,1320,.25),(.115,1760,.10)]:
 local=np.maximum(0,t-offset);env=(1-np.exp(-local*800))*np.exp(-local*18)*(t>=offset)
 sound+=gain*env*np.sin(2*np.pi*freq*local)
sound*=np.minimum(1,np.maximum(0,(.32-t)/.025))
with wave.open(str(audio/'pickup-chime.wav'),'wb') as f:
 f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes((np.clip(sound,-1,1)*32767).astype('<i2').tobytes())
print(metadata);print('PASS: opaque RGB preserved; all enclosed pixels opaque; chime 0.32 s generated.')
