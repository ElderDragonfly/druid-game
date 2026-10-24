"""Exact horizontal mirror of the existing left-walk PNGs and GIF."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/art/bear-walk-v1'
frames=[]
for i in range(8):
    left=Image.open(OUT/f'walk-{i:02d}.png').convert('RGBA')
    right=left.transpose(Image.Transpose.FLIP_LEFT_RIGHT);right.save(OUT/f'walk-right-{i:02d}.png');frames.append(right)
    assert np.array_equal(np.array(right),np.array(left)[:,::-1])
sheet=Image.new('RGBA',(96*8,80))
for i,frame in enumerate(frames):sheet.alpha_composite(frame,(96*i,0))
sheet.save(OUT/'walk-right-sheet.png')
left_gif=Image.open(OUT/'bear-walk-preview.gif');pixels=[];durations=[]
for i in range(left_gif.n_frames):
    left_gif.seek(i);durations.append(left_gif.info['duration'])
    pixels.append(np.array(left_gif.convert('RGB'))[:,::-1])
# Build an exact index map; nearest-color palette conversion can shift close RGBs.
colors,indices=np.unique(np.stack(pixels).reshape(-1,3),axis=0,return_inverse=True)
assert len(colors)<=256
indices=indices.reshape((8,320,384));palette=colors.flatten().tolist()+[0]*(768-len(colors)*3)
preview=[]
for frame in indices:
    image=Image.fromarray(frame.astype('uint8'),'P');image.putpalette(palette);preview.append(image)
preview[0].save(OUT/'bear-walk-right-preview.gif',save_all=True,append_images=preview[1:],duration=durations,loop=0,disposal=2,optimize=False)
check=Image.open(OUT/'bear-walk-right-preview.gif');assert check.n_frames==8 and check.info.get('loop')==0
for i in range(8):
    left_gif.seek(i);check.seek(i)
    assert check.info['duration']==left_gif.info['duration']
    assert np.array_equal(np.array(check.convert('RGB')),np.array(left_gif.convert('RGB'))[:,::-1])
(OUT/'animation-right.json').write_text(json.dumps({'animation':'walk','direction':'right-three-quarter','frameWidth':96,'frameHeight':80,
    'frames':8,'durationsMs':durations,'cycleMs':sum(durations),'groundY':72,'torsoAnchorX':43,'mirroredFrom':'walk-sheet.png'},indent=2)+'\n')
print('Right walk: all eight RGBA frames and displayed GIF pixels exactly mirror the existing left walk; 1280 ms loop.')
