"""Add wingbeats to front/back strikes without redrawing body or tail poses."""
from pathlib import Path
import json
import numpy as np
from PIL import Image

folder=Path(__file__).resolve().parents[1]/'docs/art/forest-insect-v1'
metadata=json.loads((folder/'animations.json').read_text())
for direction in ('up','down'):
    path=folder/('attack-'+direction+'.png')
    base_path=folder/('attack-'+direction+'-base.png')
    current=Image.open(path).convert('RGBA')
    if current.width==128*4:current.save(base_path)
    source=Image.open(base_path).convert('RGBA')
    frames=[]
    for pose in range(4):
        original=source.crop((pose*128,0,(pose+1)*128,112))
        data=np.array(original);yy,xx=np.indices(data.shape[:2]);rgb=data[:,:,:3].astype(int)
        # Only outer wing silhouettes. The central head, body, tail and their
        # timing are retained from the four approved base poses.
        top,bottom,hinge_y=(31,51,46) if direction=='up' else (20,39,33)
        purple=(rgb[:,:,0]>rgb[:,:,1]+15)&(rgb[:,:,2]>rgb[:,:,1]+15)
        wings=[];body=data.copy()
        for side,region,hinge in (
            ('left',(xx<58)&(xx>=32),(58,hinge_y)),
            ('right',(xx>=71)&(xx<96),(71,hinge_y)),
        ):
            mask=region&(yy>=top)&(yy<bottom)&(data[:,:,3]>0)&~purple
            wing=data.copy();wing[~mask]=0;body[mask]=0
            wings.append((side,Image.fromarray(wing),hinge))
        for phase in range(8):
            frame=Image.new('RGBA',original.size)
            angle=(0,28,55,28)[phase%4]
            for side,wing,hinge in wings:
                moved=wing.rotate(angle if side=='left' else -angle,Image.Resampling.NEAREST,center=hinge)
                frame.alpha_composite(moved)
            frame.alpha_composite(Image.fromarray(body))
            frames.append(frame)
    sheet=Image.new('RGBA',(128*len(frames),112))
    for index,frame in enumerate(frames):sheet.alpha_composite(frame,(index*128,0))
    sheet.save(path)
    durations=[660/len(frames)]*len(frames)
    metadata['animations']['attack-'+direction]={'frames':len(frames),'durations':durations}
    previews=[]
    shadow=Image.open(folder/'shadow.png').convert('RGBA')
    for frame in frames:
        bg=Image.new('RGBA',frame.size,'#303842');bg.alpha_composite(shadow);bg.alpha_composite(frame)
        previews.append(bg.convert('RGB').resize((384,336),Image.Resampling.NEAREST))
    previews[0].save(folder/('attack-'+direction+'-preview.gif'),save_all=True,append_images=previews[1:],
        duration=durations,loop=0,disposal=2)
    print(direction,':',len(frames),'frames, 4 unchanged tail phases with wingbeats, duration 660 ms')
(folder/'animations.json').write_text(json.dumps(metadata,indent=2)+'\n')
