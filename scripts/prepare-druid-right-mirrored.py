"""Mirror the approved left brown lower body, retaining exact source pixels.

No new leg drawing, scaling, rigging or stride interpolation. Composite under the
accepted right-facing clothes/arm/staff. Four phases at the left cycle's tempo.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy.ndimage import binary_fill_holes, binary_erosion, label, distance_transform_edt

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'docs/art'
OUT = ART / 'druid-walk-right-v4'
OUT.mkdir(exist_ok=True)
SIZE = (256,320)
source = Image.open(ART / 'druid-eight-way-v1/walk-right-256x320.png').convert('RGBA')
staff = Image.open(ART / 'druid-side-refinement-v1/walk-right-arm-staff-256x320.png').convert('RGBA')
donor = Image.open(ART / 'druid-side-refinement-v1/walk-left-body-256x320.png').convert('RGBA')
y,x = np.indices((320,256))
HEMS = [
    [(75,214),(82,222),(104,231),(116,233),(119,226),(127,226),(150,218),(158,214)],
    [(77,221),(94,231),(99,221),(109,224),(119,228),(123,224),(135,226),(153,222),(159,217)],
    [(75,214),(82,221),(105,232),(116,234),(120,225),(127,226),(150,219),(158,215)],
    [(78,221),(94,232),(99,222),(108,226),(120,228),(124,224),(137,226),(155,221),(160,215)],
]


def polygon(points):
    mask = Image.new('L', SIZE)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return np.array(mask) > 0


tops=[[(98,222),(113,228),(128,231),(136,233),(153,230),(164,225)],
      [(107,227),(120,231),(137,233),(153,229),(164,225)],
      [(98,222),(114,228),(129,231),(136,233),(153,230),(164,225)],
      [(107,227),(120,231),(137,233),(154,229),(164,225)]]

def garments(index):
    original=source.crop((index*256,0,(index+1)*256,320))
    a=np.array(original)
    hsv=np.array(original.convert('RGB').convert('HSV'))
    keep=(y<220)|polygon([(0,0),(255,0),(255,210)]+list(reversed(HEMS[index]))+[(0,210)])
    # Find the true green cloak edge per row, then keep its full RGB interior,
    # including brown/black folds. Colour is used for the contour, never holes.
    green=(hsv[:,:,0]>=37)&(hsv[:,:,0]<=100)&(hsv[:,:,1]>35)&(a[:,:,3]>0)
    edge=95
    for row in range(220,268):
        candidates=np.where(green[row,:min(edge,95)])[0]
        if len(candidates):
            edge=min(edge,int(candidates.max())+2)
            keep[row,:edge]=True
    # The small front cape flap is separate from the swinging leg silhouette.
    for row in range(220,252):
        candidates=np.where(green[row,147:174])[0]
        if len(candidates):keep[row,147+int(candidates.min())-1:]=True
    a[~keep]=0
    return original,Image.fromarray(a)


def atlas(frames,filename):
    strip=Image.new('RGBA',(256*len(frames),320))
    for i,frame in enumerate(frames):strip.paste(frame,(i*256,0))
    strip.save(OUT/filename,optimize=True)
    return strip


def mirrored_legs(index):
    original=donor.crop((index*256,0,(index+1)*256,320))
    data=np.array(original)
    # A broad anatomical crop removes the tunic. Hue selects only the brown
    # outer contour; filling enclosed holes preserves ALL original interior RGB.
    region=polygon(tops[index]+[(170,258),(200,269),(205,305),(55,305),(55,265),(96,250)])
    hsv=np.array(original.convert('RGB').convert('HSV'))
    brown=(hsv[:,:,0]<34)|(hsv[:,:,1]<25)
    mask=binary_fill_holes(region&(data[:,:,3]>0)&(brown|(y>=268)))
    # Detached dark pixels belong to the donor cloak, not its brown legs.
    components,_=label(mask)
    counts=np.bincount(components.ravel());counts[0]=0
    mask &= counts[components]>=200
    data[~mask]=0
    assert np.array_equal(data[mask],np.array(original)[mask])
    return Image.fromarray(mask.astype('uint8')*255),ImageOps.mirror(Image.fromarray(data))


def hip_join(legs):
    a=np.array(legs)
    # The right tunic has a different hem. Extend only the hidden upper trousers
    # to meet it, using RGB from THIS mirrored phase. Never add an old calf/boot.
    region=polygon([(88,212),(157,212),(158,234),(150,238),(106,238),(89,238)])
    interior=binary_erosion(a[:,:,3]>0,iterations=2)
    nearest=distance_transform_edt(~interior,return_distances=False,return_indices=True)
    join=np.zeros_like(a)
    missing=region&(a[:,:,3]==0)
    join[missing]=a[nearest[0][missing],nearest[1][missing]]
    return Image.fromarray(join)


frames,leg_frames,foregrounds,masks,joins=[],[],[],[],[]
for phase in range(4):
    original,foreground=garments(phase)
    mask,legs=mirrored_legs(phase)
    frame=staff.crop((phase*256,0,(phase+1)*256,320))
    join=hip_join(legs)
    frame.alpha_composite(legs)
    frame.alpha_composite(join)
    frame.alpha_composite(foreground)
    frame.paste(original.crop((0,0,256,220)),(0,0))
    assert np.array_equal(np.array(frame)[:220],np.array(original)[:220])
    frames.append(frame);leg_frames.append(legs);foregrounds.append(foreground);joins.append(join)
    masks.append(mask.convert('RGBA'))
strip=atlas(frames,'walk-right-256x320.png')
atlas(leg_frames,'legs-right-256x320.png')
atlas(joins,'hip-join-256x320.png')
atlas(foregrounds,'garments-256x320.png')
atlas(masks,'left-leg-mask-256x320.png')
preview=Image.new('RGB',strip.size,(36,46,40));preview.paste(strip,mask=strip.getchannel('A'))
preview.save(OUT/'walk-right-frames-preview.png')
previews=[]
for frame in frames:
    p=Image.new('RGB',SIZE,(36,46,40));p.paste(frame,mask=frame.getchannel('A'));previews.append(p)
previews[0].save(OUT/'walk-right-preview.gif',save_all=True,append_images=previews[1:],duration=240,loop=0,disposal=2)
(OUT/'art.json').write_text(json.dumps({'frameWidth':256,'frameHeight':320,'frameCount':4,
    'frameDurationMs':240,'cycleMs':960,
    'upperSource':'../druid-eight-way-v1/walk-right-256x320.png',
    'legSource':'../druid-side-refinement-v1/walk-left-body-256x320.png',
    'legTransform':'horizontal mirror only','rgbPreserved':True,
    'legScale':1,'legTranslation':[0,0],
    'layerOrder':['far-side staff','mirrored left legs','upper trousers join only','original garments'],
    'staticOldLegLayer':False},indent=2)+'\n')
