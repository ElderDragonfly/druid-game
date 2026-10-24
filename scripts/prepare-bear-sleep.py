"""Register the new lying poses and assemble a quiet breathing loop."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/art/bear-sleep-v1'
source=Image.open(OUT/'sleep-source.png').convert('RGBA');poses=[]
for i in range(3):
    cell=source.crop((i%2*768,i//2*512,(i%2+1)*768,(i//2+1)*512)).resize((85,57),Image.Resampling.NEAREST)
    a=np.array(cell);mask=a[:,:,3]>=200;a[:,:,3]=mask.astype('uint8')*255;a[~mask]=0
    yy,xx=np.where(mask)
    frame=Image.new('RGBA',(96,80));frame.alpha_composite(Image.fromarray(a),(12-int(xx.min()),72-int(yy.max())))
    frame.save(OUT/f'sleep-{i:02d}.png');poses.append(frame)
    yy,xx=np.where(np.array(frame)[:,:,3]>0)
    assert xx.min()>3 and xx.max()<92 and yy.min()>3 and yy.max()==72
# Exhale -> half inhale -> full inhale -> half exhale. Reusing the middle pose
# avoids a second breath or a new face/paw pose at the loop boundary.
sequence=[0,1,2,1];times=[1000,800,1000,800];frames=[poses[i] for i in sequence]
sheet=Image.new('RGBA',(96*4,80))
for i,frame in enumerate(frames):sheet.alpha_composite(frame,(i*96,0))
sheet.save(OUT/'sleep-sheet.png');poses[0].save(OUT/'sleeping.png')
sheet.resize((1536,320),Image.Resampling.NEAREST).save(OUT/'sleep-frames.png')
previews=[];strip=Image.new('RGB',(96*4,80))
for i,frame in enumerate(frames):
    bg=Image.new('RGBA',(96,80),'#496252');bg.alpha_composite(frame);bg=bg.convert('RGB')
    strip.paste(bg,(i*96,0));previews.append(bg)
palette=strip.quantize(colors=96,method=Image.Quantize.MEDIANCUT)
indexed=[f.quantize(palette=palette,dither=Image.Dither.NONE).resize((384,320),Image.Resampling.NEAREST) for f in previews]
indexed[0].save(OUT/'bear-sleep-preview.gif',save_all=True,append_images=indexed[1:],duration=times,loop=0,disposal=2,optimize=False)
(OUT/'animation.json').write_text(json.dumps({'animation':'sleep','direction':'left-three-quarter','frameWidth':96,'frameHeight':80,
    'poses':3,'sequence':sequence,'durationsMs':times,'cycleMs':sum(times),'groundY':72,
    'source':'sleep-source.png','designReference':'../7f3bc9083f8614b16f7bdff957d5eb17.jpg'},indent=2)+'\n')
check=Image.open(OUT/'bear-sleep-preview.gif');assert check.n_frames==4 and check.info.get('loop')==0
for i,ms in enumerate(times):check.seek(i);assert check.info['duration']==ms and check.size==(384,320)
print('Sleeping bear: three drawn lying poses, four breathing phases, 3600 ms loop; no game integration.')
