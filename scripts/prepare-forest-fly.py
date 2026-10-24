"""Cut the user's complete fly reel; restore its exact 6× logical pixels."""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'docs/art/21b6e2a5df123c784950d74653ae51a9.gif'
folder=ROOT/'docs/art/forest-fly-v2';folder.mkdir(exist_ok=True)
gif=Image.open(source);frames=[];durations=[]
for n in range(gif.n_frames):
    gif.seek(n);a=np.array(gif.convert('RGBA'));bg=a[0,0,:3]
    a[:,:,3]=np.where(np.all(a[:,:,:3]==bg,axis=2),0,255)
    crop=Image.fromarray(a).crop((250,68,538,338))
    small=crop.resize((48,45),Image.Resampling.NEAREST)
    # The source uses exact 6×6 blocks: no opaque drawing pixel is redrawn.
    assert np.array_equal(np.array(crop),np.repeat(np.repeat(np.array(small),6,axis=0),6,axis=1))
    cell=Image.new('RGBA',(64,64));cell.alpha_composite(small,(8,5));frames.append(cell)
    durations.append(gif.info.get('duration',100))
segments={'fly':list(range(8)),'attack':list(range(36,44)),'death':list(range(44,55))}
metadata={'frameWidth':64,'frameHeight':64,'feetX':33,'feetY':44,
 'source':str(source.relative_to(ROOT)),'sourceFrameCount':gif.n_frames,'sourceFacing':'left',
 'attackImpactMs':300,'animations':{}}
for name,indices in segments.items():
    poses=[frames[i] for i in indices];times=[durations[i] for i in indices]
    sheet=Image.new('RGBA',(64*len(poses),64))
    for i,pose in enumerate(poses):sheet.alpha_composite(pose,(64*i,0))
    sheet.save(folder/(name+'.png'))
    metadata['animations'][name]={'frames':len(poses),'durations':times,'sourceFrames':indices}
    for direction in ('left','right'):
        previews=[]
        for pose in poses:
            bg=Image.new('RGBA',pose.size,'#303842')
            bg.alpha_composite(pose if direction=='left' else pose.transpose(Image.Transpose.FLIP_LEFT_RIGHT))
            previews.append(bg.convert('RGB').resize((256,256),Image.Resampling.NEAREST))
        previews[0].save(folder/(name+'-'+direction+'-preview.gif'),save_all=True,append_images=previews[1:],duration=times,loop=0,disposal=2)
# A small neutral ground marker is independent of the selected figure.
shadow=Image.new('RGBA',(64,64));ImageDraw.Draw(shadow).ellipse((24,40,42,45),fill=(13,24,19,85));shadow.save(folder/'shadow.png')
(folder/'animations.json').write_text(json.dumps(metadata,indent=2)+'\n')
print('Prepared source fly, attack and death; only mirrored left/right views.')
