"""Mechanically crop/register the drawn eight-pose sheet and assemble a GIF.
Requires Pillow and NumPy; never changes the game or paints over body pixels.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/art/bear-walk-v1'
source=Image.open(OUT/'walk-source.png').convert('RGBA')
frames=[];registrations=[]
for i in range(8):
    # Keep a common 6× reduction, including the generated sheet's odd-sized edge.
    x=round(i%4*source.width/4);y=round(i//4*source.height/2)
    cell=source.crop((x,y,x+444,y+444)).resize((74,74),Image.Resampling.NEAREST)
    a=np.array(cell);solid=a[:,:,3]>=200
    a[:,:,3]=solid.astype('uint8')*255;a[~solid]=0
    yy,xx=np.where(solid);floor=int(yy.max());top=int(yy.min())
    # Register the upper torso, not the changing outline of the swinging paws.
    band=solid.copy();band[:top]=False;band[top+max(1,round((floor-top)*.35)):]=False
    anchor=int(round(np.where(band)[1].mean()))
    offset=(52-anchor,72-floor)
    frame=Image.new('RGBA',(96,80));frame.alpha_composite(Image.fromarray(a),offset)
    frame.save(OUT/f'walk-{i:02d}.png');frames.append(frame)
    registrations.append({'sourceCell':i,'translation':list(offset),'groundY':72})
    alpha=np.array(frame)[:,:,3];y0,x0=np.where(alpha>0)
    assert x0.min()>3 and x0.max()<92 and y0.min()>3 and y0.max()<77,'Drawing clipped by cell boundary'
    assert int(y0.max())==72
sheet=Image.new('RGBA',(96*8,80));contact=Image.new('RGBA',(96*4,80*2))
for i,frame in enumerate(frames):
    sheet.alpha_composite(frame,(96*i,0));contact.alpha_composite(frame,(96*(i%4),80*(i//4)))
sheet.save(OUT/'walk-sheet.png');contact.resize((1536,640),Image.Resampling.NEAREST).save(OUT/'walk-frames.png')
# A single palette for the entire GIF prevents color changes between poses.
previews=[]
for frame in frames:
    bg=Image.new('RGBA',frame.size,'#496252');bg.alpha_composite(frame);previews.append(bg.convert('RGB'))
strip=Image.new('RGB',(96*8,80))
for i,frame in enumerate(previews):strip.paste(frame,(96*i,0))
palette=strip.quantize(colors=96,method=Image.Quantize.MEDIANCUT)
indexed=[frame.quantize(palette=palette,dither=Image.Dither.NONE).resize((384,320),Image.Resampling.NEAREST) for frame in previews]
indexed[0].save(OUT/'bear-walk-preview.gif',save_all=True,append_images=indexed[1:],duration=[160]*8,loop=0,disposal=2,optimize=False)
(OUT/'animation.json').write_text(json.dumps({'animation':'walk','direction':'left-three-quarter','frameWidth':96,'frameHeight':80,
    'frames':8,'durationsMs':[160]*8,'cycleMs':1280,'groundY':72,'torsoAnchorX':52,'sourceSheet':'walk-source.png',
    'designReference':'../7f3bc9083f8614b16f7bdff957d5eb17.jpg','motionReferences':['../08f30658094e60df6fabc4dd417168c3.jpg','../abd1f9552d1a3b5fd43d3a521295b800.jpg'],
    'registrations':registrations},indent=2)+'\n')
# Check the delivered GIF, not just the source frame list.
check=Image.open(OUT/'bear-walk-preview.gif');assert check.n_frames==8 and check.info.get('loop')==0
for i in range(8):check.seek(i);assert check.info['duration']==160 and check.size==(384,320)
assert len({frame.tobytes() for frame in frames})==8
print('Prepared 8 distinct transparent 96×80 frames, atlas and looping 384×320 GIF; cycle 1280 ms.')
