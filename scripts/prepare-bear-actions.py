"""Cut the four new drawn sheets into left-facing run/attack previews.
Pillow + NumPy only; no game integration, mirroring or painting over body parts.
"""
from pathlib import Path
from collections import deque
import json
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/art/bear-actions-v1'
WIDTH,HEIGHT,GROUND=128,96,80
CONFIG={
 'run':{'scale':6,'times':[100]*8,'impact':None},
 'swipe':{'neutralWidth':342,'times':[350,130,180,70,70,100,140,260],'impact':4},
 'bite':{'neutralWidth':359,'times':[350,140,160,70,80,110,140,250],'impact':4},
 'slam':{'neutralWidth':353,'times':[400,160,200,180,80,120,180,300],'impact':5},
}

def components(mask):
    h,w=mask.shape;labels=np.zeros((h,w),dtype=np.int32);parts=[]
    for y in range(h):
        for x in range(w):
            if not mask[y,x] or labels[y,x]:continue
            label=len(parts)+1;labels[y,x]=label;q=deque([(x,y)]);xs=[];ys=[]
            while q:
                px,py=q.popleft();xs.append(px);ys.append(py)
                for nx,ny in ((px-1,py),(px+1,py),(px,py-1),(px,py+1)):
                    if 0<=nx<w and 0<=ny<h and mask[ny,nx] and not labels[ny,nx]:
                        labels[ny,nx]=label;q.append((nx,ny))
            parts.append({'id':label,'area':len(xs),'cx':sum(xs)/len(xs),'cy':sum(ys)/len(ys),
                'box':(min(xs),min(ys),max(xs),max(ys))})
    return labels,parts

def distance_to_box(part,box):
    x0,y0,x1,y1=box;x,y=part['cx'],part['cy']
    return np.hypot(max(x0-x,0,x-x1),max(y0-y,0,y-y1))

summary={}
for name,config in CONFIG.items():
    source=Image.open(OUT/(name+'-source.png')).convert('RGBA')
    scale=config.get('scale',config.get('neutralWidth',384)/64)
    small=source.resize((round(source.width/scale),round(source.height/scale)),Image.Resampling.NEAREST)
    a=np.array(small);mask=a[:,:,3]>=200;a[:,:,3]=mask.astype('uint8')*255;a[~mask]=0
    labels,parts=components(mask);h,w=mask.shape;major=[]
    for i in range(8):
        candidates=[p for p in parts if int(p['cx']/(w/4))==i%4 and int(p['cy']/(h/2))==i//4]
        assert candidates,(name,i,'Missing bear')
        major.append(max(candidates,key=lambda p:p['area']))
    # A paw may cross a nominal grid boundary. Keep its complete connected
    # silhouette instead of truncating it or copying it into the next cell.
    assignments={p['id']:{p['id']} for p in major}
    for part in parts:
        if part in major:continue
        nearest=min(major,key=lambda p:distance_to_box(part,p['box']))
        if distance_to_box(part,nearest['box'])<=5:assignments[nearest['id']].add(part['id'])
    pieces=[]
    for part in major:
        keep=np.isin(labels,list(assignments[part['id']]))
        pixels=a.copy();pixels[~keep]=0;yy,xx=np.where(keep)
        pieces.append((pixels,keep,(int(xx.min()),int(yy.min()),int(xx.max()),int(yy.max()))))
    row_floors=[max(pieces[i][2][3] for i in range(row*4,row*4+4)) for row in range(2)]
    frames=[];registration=[]
    for i,(pixels,keep,box) in enumerate(pieces):
        x0,y0,x1,y1=box
        if name=='run':
            band=keep.copy();band[:y0]=False;band[y0+max(1,round((y1-y0)*.35)):]=False
            anchor=int(round(np.where(band)[1].mean()));dx=68-anchor
            dy=GROUND-row_floors[i//4]
        else:
            yy,xx=np.indices(keep.shape)
            hind=keep&(yy>=y1-max(3,round((y1-y0)*.12)))&(xx>=x0+(x1-x0)*.65)
            assert hind.any(),(name,i,'Missing hind-foot anchor')
            anchor=int(round(np.median(xx[hind])));dx=90-anchor;dy=GROUND-y1
        assert x0+dx>=4 and x1+dx<WIDTH-4 and y0+dy>=4 and y1+dy<HEIGHT-4,(name,i,box,dx,dy)
        frame=Image.new('RGBA',(WIDTH,HEIGHT));frame.alpha_composite(Image.fromarray(pixels),(dx,dy));frames.append(frame)
        registration.append({'sourcePose':i,'translation':[dx,dy],'groundClearance':GROUND-(y1+dy)})
    sequence=list(range(8))
    if name!='run':
        frames[7]=frames[0].copy();sequence[7]=0
        registration[7]={**registration[0],'sourcePose':0}
    sheet=Image.new('RGBA',(WIDTH*8,HEIGHT));contact=Image.new('RGBA',(WIDTH*4,HEIGHT*2))
    previews=[]
    for i,frame in enumerate(frames):
        frame.save(OUT/f'{name}-{i:02d}.png');sheet.alpha_composite(frame,(WIDTH*i,0));contact.alpha_composite(frame,(WIDTH*(i%4),HEIGHT*(i//4)))
        bg=Image.new('RGBA',frame.size,'#496252');bg.alpha_composite(frame);previews.append(bg.convert('RGB'))
    sheet.save(OUT/(name+'-sheet.png'));contact.resize((WIDTH*4*3,HEIGHT*2*3),Image.Resampling.NEAREST).save(OUT/(name+'-frames.png'))
    strip=Image.new('RGB',(WIDTH*8,HEIGHT))
    for i,frame in enumerate(previews):strip.paste(frame,(WIDTH*i,0))
    palette=strip.quantize(colors=96,method=Image.Quantize.MEDIANCUT)
    indexed=[f.quantize(palette=palette,dither=Image.Dither.NONE).resize((WIDTH*4,HEIGHT*4),Image.Resampling.NEAREST) for f in previews]
    target=OUT/('bear-'+name+'-preview.gif')
    indexed[0].save(target,save_all=True,append_images=indexed[1:],duration=config['times'],loop=0,disposal=2,optimize=False)
    check=Image.open(target);assert check.n_frames==8 and check.info.get('loop')==0
    for i,ms in enumerate(config['times']):check.seek(i);assert check.info['duration']==ms and check.size==(WIDTH*4,HEIGHT*4)
    assert len({f.tobytes() for f in frames})>=7
    if name!='run':assert frames[0].tobytes()==frames[-1].tobytes()
    data={'animation':name,'direction':'left-three-quarter','frameWidth':WIDTH,'frameHeight':HEIGHT,'groundY':GROUND,
        'frames':8,'sourcePoseSequence':sequence,'durationsMs':config['times'],'cycleMs':sum(config['times']),
        'contactFrame':config['impact'],'source':name+'-source.png','registrations':registration}
    (OUT/(name+'-animation.json')).write_text(json.dumps(data,indent=2)+'\n');summary[name]=data
    print(name,': 8 frames,',data['cycleMs'],'ms, original direction only; all paws and head inside cell')
(OUT/'animations.json').write_text(json.dumps(summary,indent=2)+'\n')
