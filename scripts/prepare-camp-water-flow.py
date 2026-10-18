"""Bake slow ripple sprites along authored river paths; never displace the camp.

Only the isolated ripple sprite is translated. The original river, rocks and
banks keep their coordinates. Runtime uses the resulting PNG atlas directly.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion, shift

ROOT = Path(__file__).resolve().parents[1]
OLD = ROOT / 'docs/art/selection-camp-frames-v1'
OUT = ROOT / 'docs/art/selection-water-flow-v2'
COUNT, COLS, FPS = 144, 8, 24
# Coordinates relative to the 204x142 river crop. Each lane follows its bend,
# including the short waterfall; none is a global downward image translation.
LANES = [
    {'points': [[198,10],[181,13],[162,17],[169,24]], 'size': [16,3], 'phase': .0},
    {'points': [[176,32],[171,43],[165,54],[158,63]], 'size': [13,4], 'phase': .3},
    {'points': [[163,32],[158,43],[153,54],[149,63]], 'size': [12,4], 'phase': .1},
    {'points': [[182,32],[177,43],[171,54],[164,63]], 'size': [11,3], 'phase': .7},
    {'points': [[151,70],[141,80],[127,88],[124,96],[113,104],[105,109]], 'size': [13,3], 'phase': .2},
    {'points': [[108,110],[111,116],[120,120],[117,128],[99,131],[78,131],[52,131],[14,134]], 'size': [19,3], 'phase': .6},
]


def make_frames():
    original = np.array(Image.open(OLD/'water-reference.png').convert('RGBA'))
    h,w = original.shape[:2]
    # Protect one more native pixel along all banks, rocks and holes in the mask.
    allowed = binary_erosion(np.array(Image.open(OLD/'water-change-mask.png')) > 0, structure=np.ones((3,3)))
    source = Image.open(OUT/'ripple-source.png').convert('RGBA')
    a = np.array(source)[:,:,3]
    ys,xs = np.where(a >= 180)
    source = source.crop((xs.min(),ys.min(),xs.max()+1,ys.max()+1))
    lanes = []
    for lane in LANES:
        sprite = np.array(source.resize(tuple(lane['size']),Image.Resampling.NEAREST)).astype(float)
        # Extract drawn stepped ripple coverage and its light/dark accents.
        ripple = sprite[:,:,3]/255 * (.45 + .55*sprite[:,:,:3].mean(axis=2)/255)
        canvas = np.zeros((h,w)); sh,sw = ripple.shape
        canvas[2:sh+2,2:sw+2] = ripple
        points = np.array(lane['points'],dtype=float)
        lengths = np.linalg.norm(np.diff(points,axis=0),axis=1)
        distances = np.r_[0,np.cumsum(lengths)]
        lanes.append((lane,canvas,points,lengths,distances,max(1,round(distances[-1]/24))))
    frames=[]; motion=np.zeros((h,w),dtype=bool)
    for index in range(COUNT):
        light=np.zeros((h,w))
        for lane,sprite,points,lengths,distances,n in lanes:
            length=distances[-1]
            for particle in range(n):
                distance=((particle+(index/COUNT+lane['phase'])%1)/n)*length
                segment=min(len(lengths)-1,np.searchsorted(distances,distance,side='right')-1)
                t=(distance-distances[segment])/lengths[segment]
                x,y=points[segment]*(1-t)+points[segment+1]*t
                # Entry and exit fade prevent particles popping at the loop seam.
                fade=min(1,distance/7,(length-distance)/7)
                sw,sh=lane['size']
                light+=shift(sprite,(y-sh/2-2,x-sw/2-2),order=1,mode='constant',prefilter=False)*fade
        light=np.minimum(light,1)*allowed
        result=original.copy()
        # Visible blue/cyan ripple accents; the water surface stays fixed.
        result[:,:,:3]=np.clip(np.rint(original[:,:,:3].astype(float)+light[:,:,None]*[42,66,74]),0,255).astype('uint8')
        motion|=np.any(result!=original,axis=2)
        assert np.array_equal(result[~allowed],original[~allowed])
        frames.append(Image.fromarray(result))
    atlas=Image.new('RGBA',(w*COLS,h*((COUNT+COLS-1)//COLS)))
    for i,frame in enumerate(frames): atlas.paste(frame,(i%COLS*w,i//COLS*h))
    atlas.save(OUT/'water-frames.png',optimize=True)
    Image.fromarray(original).save(OUT/'water-reference.png',optimize=True)
    Image.fromarray((motion*255).astype('uint8')).save(OUT/'water-change-mask.png')
    palette=atlas.convert('RGB').quantize(colors=256,dither=Image.Dither.NONE)
    gif=[f.convert('RGB').quantize(palette=palette,dither=Image.Dither.NONE) for f in frames]
    # GIF time units are 10ms: distribute 40/50ms to retain exactly six seconds.
    durations=[40 if i%6!=5 else 50 for i in range(COUNT)]
    gif[0].save(OUT/'water-preview.gif',save_all=True,append_images=gif[1:],duration=durations,loop=0,disposal=2,optimize=False)
    data=np.array([np.array(f).astype(int) for f in frames])
    adjacent=np.abs(data-np.roll(data,1,axis=0))
    metadata={'frames':COUNT,'fps':FPS,'cycleMs':6000,'frameSize':[w,h],'atlasColumns':COLS,
              'maxAdjacentChannelChange':int(adjacent.max()),'maxChangeFromOriginal':int(np.abs(data-original).max()),
              'lanes':LANES,'approxTravelPixelsPerSecond':[round(l[-2][-1]/l[-1]/6,2) for l in lanes],
              'protectedBankMarginPixels':1,'runtime':'PNG frame switching; original scene never displaced'}
    (OUT/'art.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print(json.dumps({k:v for k,v in metadata.items() if k not in ('lanes',)},indent=2))


if __name__=='__main__': make_frames()
