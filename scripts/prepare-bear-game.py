"""Unify approved bear sprites onto a common anchor and mirror exactly."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];ART=ROOT/'docs/art';OUT=ART/'bear-game-v1';OUT.mkdir(exist_ok=True)
W,H,X,Y=160,128,80,100
sources={
 'sleep':(ART/'bear-sleep-v1/sleep-sheet.png',96,80,72,[1000,800,1000,800]),
 'walk':(ART/'bear-walk-v1/walk-sheet.png',96,80,72,[160]*8),
}
for name in ('run','swipe','bite','slam'):
 data=json.loads((ART/f'bear-actions-v1/{name}-animation.json').read_text())
 sources[name]=(ART/f'bear-actions-v1/{name}-sheet.png',128,96,80,data['durationsMs'])
frames={};meta={'frameWidth':W,'frameHeight':H,'feetX':X,'feetY':Y,'animations':{}}
for name,(path,w,h,ground,times) in sources.items():
 sheet=Image.open(path).convert('RGBA');first=sheet.crop((0,0,w,h));box=first.getbbox();anchor=(box[0]+box[2])/2
 dx=round(X-anchor);dy=Y-ground;poses=[]
 for i in range(len(times)):
  frame=Image.new('RGBA',(W,H));frame.alpha_composite(sheet.crop((i*w,0,(i+1)*w,h)),(dx,dy));poses.append(frame)
  a=np.array(frame)[:,:,3];yy,xx=np.where(a>0);assert xx.min()>2 and xx.max()<W-2 and yy.min()>2 and yy.max()<H-2
 frames[name]=poses
 meta['animations'][name]={'frames':len(times),'durations':times}
 if name in ('swipe','bite','slam'):
  info=json.loads((ART/f'bear-actions-v1/{name}-animation.json').read_text());contact=info['contactFrame'];meta['animations'][name]['impactMs']=sum(times[:contact])
frames['wake']=[frames['sleep'][0],frames['sleep'][2],frames['slam'][1],frames['walk'][0]]
meta['animations']['wake']={'frames':4,'durations':[180,200,220,200]}
for name,poses in frames.items():
 for direction in ('left','right'):
  sheet=Image.new('RGBA',(W*len(poses),H))
  for i,pose in enumerate(poses):
   frame=pose if direction=='left' else pose.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
   sheet.alpha_composite(frame,(i*W,0))
   if direction=='right':assert np.array_equal(np.array(frame),np.array(pose)[:,::-1])
  sheet.save(OUT/f'{name}-{direction}.png')
(OUT/'animations.json').write_text(json.dumps(meta,indent=2)+'\n')
# Exact RGB mirrors of the approved GIF previews, without palette color shifts.
for folder,name in [(ART/'bear-actions-v1',n) for n in ('run','swipe','bite','slam')]+[(ART/'bear-sleep-v1','sleep')]:
 source=Image.open(folder/f'bear-{name}-preview.gif');pixels=[];times=[]
 for i in range(source.n_frames):source.seek(i);pixels.append(np.array(source.convert('RGB'))[:,::-1]);times.append(source.info['duration'])
 colors,indices=np.unique(np.stack(pixels).reshape(-1,3),axis=0,return_inverse=True);assert len(colors)<=256
 palette=colors.flatten().tolist()+[0]*(768-len(colors)*3);indexed=[]
 for frame in indices.reshape((len(pixels),source.height,source.width)):
  im=Image.fromarray(frame.astype('uint8'),'P');im.putpalette(palette);indexed.append(im)
 path=folder/f'bear-{name}-right-preview.gif';indexed[0].save(path,save_all=True,append_images=indexed[1:],duration=times,loop=0,disposal=2,optimize=False)
 check=Image.open(path);assert check.n_frames==len(pixels)
 for i,p in enumerate(pixels):check.seek(i);assert np.array_equal(np.array(check.convert('RGB')),p) and check.info['duration']==times[i]
print('Prepared common bear frames and exact right-side GIF mirrors; all approved originals retained.')
