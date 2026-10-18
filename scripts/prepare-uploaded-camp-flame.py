"""Extract the uploaded GIF's warm flame pixels and register its original frames.

No new flame is generated. The grid/backdrop and the uploaded logs are excluded;
only a uniformly scaled flame is composited over the accepted static camp base.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import label, binary_closing, distance_transform_edt

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'5b8606e6d60a88955aeda65edbd5a0fa62386d21.gif'
OLD=ROOT/'docs/art/selection-camp-frames-v1'
OUT=ROOT/'docs/art/selection-camp-uploaded-flame-v1'
COLS=8
PLAYBACK_FPS=18.75


def prepare():
    OUT.mkdir(parents=True,exist_ok=True)
    gif=Image.open(SOURCE)
    base=Image.open(OLD/'fire-base.png').convert('RGBA')
    reference=Image.open(OLD/'fire-reference.png').convert('RGBA')
    motion=np.zeros((148,128),dtype=bool)
    change=np.array(Image.open(OLD/'fire-change-mask.png'))>0
    frames=[]; durations=[]; layers=[]
    for i in range(gif.n_frames):
        gif.seek(i); data=np.array(gif.convert('RGBA')); rgb=data[:,:,:3].astype(float)
        r,g,b=np.moveaxis(rgb,-1,0); yy,xx=np.indices(r.shape)
        flame=(r>95)&(g>35)&(b<40)&(r>g*1.02)&(g>b*2)&(yy<398)
        # The side log caps are static red/white objects, not detached sparks.
        flame&=~(((xx<142)&(yy>=345))|((xx>=348)&(yy>=338)))
        # The GIF has a fixed drafting grid over the flame as well as the
        # backdrop. Remove only its periodic 1-2px strokes, sampling adjacent
        # real flame colours; no newly invented colours or shapes are added.
        periodX,periodY=10.6847,10.5874
        grid=(np.abs((xx-4.17+periodX/2)%periodX-periodX/2)<1.05)|(
              np.abs((yy-6.81+periodY/2)%periodY-periodY/2)<1.05)
        flame|=grid&binary_closing(flame,structure=np.ones((3,3)))
        components,_=label(flame,np.ones((3,3)))
        sizes=np.bincount(components.ravel()); sizes[0]=0
        flame&=sizes[components]>=9
        solid=flame&~grid
        nearest=distance_transform_edt(~solid,return_distances=False,return_indices=True)
        repair=flame&grid
        data[repair]=data[nearest[0][repair],nearest[1][repair]]
        data[:,:,3]=flame*255; data[~flame]=0
        source=Image.fromarray(data)
        # One scale and one registration for every phase; no per-frame fitting.
        scaled=source.resize((120,120),Image.Resampling.NEAREST)
        layer=Image.new('RGBA',base.size);layer.paste(scaled,(6,22))
        active=np.array(layer)[:,:,3]>0
        motion|=active;change|=active
        result=base.copy();result.alpha_composite(layer)
        frames.append(result);layers.append(layer);durations.append(gif.info.get('duration',40))
    atlas=Image.new('RGBA',(128*COLS,148*((len(frames)+COLS-1)//COLS)))
    flame_atlas=Image.new('RGBA',atlas.size)
    for i,(frame,layer) in enumerate(zip(frames,layers)):
        position=(i%COLS*128,i//COLS*148)
        atlas.paste(frame,position);flame_atlas.paste(layer,position)
        assert np.array_equal(np.array(frame)[~motion],np.array(base)[~motion])
        assert np.array_equal(np.array(frame)[~change],np.array(reference)[~change])
        assert np.array_equal(np.array(frame)[125:],np.array(base)[125:]), 'Original coals/logs must stay fixed'
    atlas.save(OUT/'fire-frames.png',optimize=True)
    flame_atlas.save(OUT/'flame-only-frames.png',optimize=True)
    base.save(OUT/'fire-base.png',optimize=True);reference.save(OUT/'fire-reference.png',optimize=True)
    Image.fromarray((motion*255).astype('uint8')).save(OUT/'fire-motion-mask.png')
    Image.fromarray((change*255).astype('uint8')).save(OUT/'fire-change-mask.png')
    palette=atlas.convert('RGB').quantize(colors=256,dither=Image.Dither.NONE)
    previews=[f.convert('RGB').quantize(palette=palette,dither=Image.Dither.NONE) for f in frames]
    preview_durations=[(round((i+1)*100/PLAYBACK_FPS)-round(i*100/PLAYBACK_FPS))*10 for i in range(len(frames))]
    previews[0].save(OUT/'fire-preview.gif',save_all=True,append_images=previews[1:],duration=preview_durations,loop=0,disposal=2,optimize=False)
    metadata={'source':SOURCE.name,'frames':len(frames),'sourceDurationsMs':durations,'sourceFps':1000/durations[0],
      'durationsMs':[1000/PLAYBACK_FPS]*len(frames),'fps':PLAYBACK_FPS,
      'cycleMs':len(frames)*1000/PLAYBACK_FPS,'frameSize':[128,148],'atlasColumns':COLS,'sourceScale':.25,
      'sourceRegistration':[6,22],'acceptedBaseUnchanged':True,'coalsAndLogsBelowY125Unchanged':True,
      'extraction':'Warm source pixels only; periodic grid strokes sampled from adjacent flame pixels; backdrop/source logs excluded; original palette and frame order retained'}
    (OUT/'art.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print(json.dumps({k:v for k,v in metadata.items() if k!='durationsMs'},indent=2))


if __name__=='__main__':prepare()
