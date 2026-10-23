"""Keep the GIF's actual animation and pixels; only missing front/back poses are drawn.
Run from the repository root. Pillow + NumPy; no external downloads.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
tree=ROOT/'docs/art/cleansing-tree-v1'
insect=ROOT/'docs/art/forest-insect-v1'
for out in (tree,insect):out.mkdir(exist_ok=True)
original=Image.open(ROOT/'docs/art/1365d0f0558fb5103506f29ec1b13334.jpg').convert('RGB')
a=np.array(original);keep=(a.min(2)<220)|(np.ptp(a.astype(int),axis=2)>25)
Image.fromarray(np.dstack((a,keep.astype('uint8')*255))).resize((100,125),Image.Resampling.NEAREST).save(tree/'corrupted.png')
clean=Image.open(tree/'cleansed-source.png').convert('RGBA').resize((100,125),Image.Resampling.NEAREST)
a=np.array(clean);a[:,:,3]=np.where(a[:,:,3]>=128,255,0)
Image.fromarray(a).save(tree/'cleansed.png')

gif=Image.open(ROOT/'docs/art/dragonfly_animation_reel_3x.gif')
frames=[];shadow=None
for index in range(gif.n_frames):
    gif.seek(index);a=np.array(gif.convert('RGBA'));rgb=a[:,:,:3]
    background=np.all(rgb==[49,56,66],2);shade=np.all(rgb==[24,16,16],2)
    a[:,:,3]=np.where(background|shade,0,255)
    # Source is already an exact 3× drawing. Restore its logical pixel grid.
    im=Image.fromarray(a).resize((134,100),Image.Resampling.NEAREST)
    cell=Image.new('RGBA',(128,112));cell.alpha_composite(im,(-3,8));frames.append(cell)
    if shadow is None:
        a[:,:,3]=shade.astype('uint8')*255
        small=Image.fromarray(a).resize((134,100),Image.Resampling.NEAREST)
        shadow=Image.new('RGBA',(128,112));shadow.alpha_composite(small,(-3,8))
shadow.save(insect/'shadow.png')
palette=np.unique(np.array(frames[0])[:,:,:3][np.array(frames[0])[:,:,3]>0],axis=0)
source=Image.open(insect/'directional-source.png').convert('RGBA')
vertical={}
for row,direction in enumerate(('up','down')):
    poses=[]
    for col in range(4):
        crop=source.crop((round(col*source.width/4),round(row*source.height/2),round((col+1)*source.width/4),round((row+1)*source.height/2)))
        crop=crop.resize((64,64),Image.Resampling.NEAREST);a=np.array(crop)
        pixels=a[:,:,:3].astype(int);dist=((pixels[:,:,None,:]-palette.astype(int))**2).sum(3)
        a[:,:,:3]=palette[dist.argmin(2)];a[:,:,3]=np.where(a[:,:,3]>=128,255,0)
        cell=Image.new('RGBA',(128,112));cell.alpha_composite(Image.fromarray(a),(32,16));poses.append(cell)
    vertical[direction]=poses

animations={'idle':frames[:16],'walk':frames[16:32],'run':frames[32:48],
    'attack-right':frames[48:64], 'attack-up':vertical['up'],'attack-down':vertical['down']}
animations['attack-left']=[im.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for im in animations['attack-right']]
for direction in ('up','down'):
    animations['idle-'+direction]=[vertical[direction][0],vertical[direction][1]]
death=[]
for angle,offset in ((0,0),(15,7),(35,14),(65,22),(85,28),(85,28)):
    rotated=frames[0].rotate(angle,Image.Resampling.NEAREST,center=(64,52))
    cell=Image.new('RGBA',(128,112));cell.alpha_composite(rotated,(0,offset));death.append(cell)
animations['death']=death
metadata={'frameWidth':128,'frameHeight':112,'feetX':64,'feetY':88,
    'source':'docs/art/dragonfly_animation_reel_3x.gif','sourceFrameCount':gif.n_frames,'animations':{}}
for name,poses in animations.items():
    sheet=Image.new('RGBA',(128*len(poses),112))
    for n,pose in enumerate(poses):sheet.alpha_composite(pose,(128*n,0))
    sheet.save(insect/(name+'.png'))
    durations=[100]*len(poses) if name=='death' else [165]*4 if name.startswith('attack-') and len(poses)==4 else [40]*len(poses)
    metadata['animations'][name]={'frames':len(poses),'durations':durations}
    if name.startswith('attack-') or name in ('run','death'):
        previews=[]
        for pose in poses:
            bg=Image.new('RGBA',pose.size,'#303842');bg.alpha_composite(shadow);bg.alpha_composite(pose)
            previews.append(bg.convert('RGB').resize((384,336),Image.Resampling.NEAREST))
        previews[0].save(insect/(name+'-preview.gif'),save_all=True,append_images=previews[1:],duration=durations,loop=0,disposal=2)
(insect/'animations.json').write_text(json.dumps(metadata,indent=2)+'\n')
print('Prepared two tree states and',len(animations),'insect sprite sheets.')

# Keep the drawing intact while exposing its ground patch as a separate layer.
import runpy
runpy.run_path(str(ROOT/"scripts/split-cleansing-tree-layers.py"),run_name="__main__")
runpy.run_path(str(ROOT/"scripts/animate-insect-attack-wings.py"),run_name="__main__")
