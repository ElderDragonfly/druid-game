"""Eight-phase right walk: two independently posed legs, no old leg underlay.

The newly drawn single leg is registered at hip/knee/ankle, then posed along a
closed alternating support/swing cycle. Source torso/arm/staff frames stay exact.
"""
from pathlib import Path
import json
import math

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import map_coordinates
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'docs/art'
OUT = ART / 'druid-walk-right-v3'
SIZE = (256, 320)
source = Image.open(ART / 'druid-eight-way-v1/walk-right-256x320.png').convert('RGBA')
staff = Image.open(ART / 'druid-side-refinement-v1/walk-right-arm-staff-256x320.png').convert('RGBA')
master = np.array(Image.open(OUT / 'leg-master.png').convert('RGBA'))
y, x = np.indices((320, 256))
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


def palette(y0, y1):
    original = np.array(source.crop((0, 0, 256, 320)))
    hsv = np.array(Image.fromarray(original).convert('RGB').convert('HSV'))
    selected = ((original[:,:,3]>0)&(y>=y0)&(y<y1)&(x>=80)&(x<165)&(hsv[:,:,0]<33))
    return np.unique(original[:,:,:3][selected], axis=0)


palettes = {'pants': palette(233,252), 'boots': palette(266,298)}
trees = {name:cKDTree(colors.astype(float)) for name,colors in palettes.items()}


def leg(phase, near):
    angle = phase * 2 * math.pi / 8 + (0 if near else math.pi)
    hip_x = 128 if near else 111
    # Both feet use the same stride centre: the perspective offset between the
    # hips must not give one foot a permanently forward screen position.
    foot_x = 120 + 18 * math.cos(angle)
    lift = max(0, -math.sin(angle)) * 5
    knee_x = hip_x + (foot_x-hip_x)*.55 + max(0,-math.sin(angle))*3
    target_y = [207, 250-lift*.25, 287-lift, 300-lift]
    source_y = np.interp(y, target_y, [65,335,460,510])
    center = np.interp(source_y, [65,335,460,510], [350,445,455,455])
    target_x = np.interp(y, target_y, [hip_x,knee_x,foot_x,foot_x])
    source_x = center+(x-target_x)/(.22 if near else .215)
    coordinates = np.array([source_y,source_x])
    data = np.stack([map_coordinates(master[:,:,c],coordinates,order=0,mode='constant',cval=0)
                     for c in range(4)],axis=2)
    data[(y<target_y[0])|(y>=target_y[-1])]=0
    for name, selection in [('pants',source_y<335),('boots',source_y>=335)]:
        selected = selection&(data[:,:,3]>0)
        colors = data[:,:,:3][selected].astype(float) * (1 if near else .92)
        _, nearest = trees[name].query(colors)
        data[:,:,:3][selected] = palettes[name][nearest]
    data[data[:,:,3]==0]=0
    return Image.fromarray(data), {'hipX':hip_x,'footX':round(foot_x,3),
                                  'soleY':round(300-lift,3),'support':lift<.01}


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


frames,near_frames,far_frames,foregrounds,registrations=[],[],[],[],[]
for phase in range(8):
    original,foreground=garments(phase//2)
    near,near_info=leg(phase,True)
    far,far_info=leg(phase,False)
    frame=staff.crop(((phase//2)*256,0,(phase//2+1)*256,320))
    for layer in (far,near,foreground):frame.alpha_composite(layer)
    frame.paste(original.crop((0,0,256,220)),(0,0))
    assert np.array_equal(np.array(frame)[:220],np.array(original)[:220])
    frames.append(frame);near_frames.append(near);far_frames.append(far);foregrounds.append(foreground)
    registrations.append({'near':near_info,'far':far_info,'upperFrame':phase//2})
strip=atlas(frames,'walk-right-256x320.png')
atlas(near_frames,'near-leg-256x320.png');atlas(far_frames,'far-leg-256x320.png')
atlas(foregrounds,'garments-256x320.png')
preview=Image.new('RGB',strip.size,(36,46,40));preview.paste(strip,mask=strip.getchannel('A'))
preview.save(OUT/'walk-right-frames-preview.png')
previews=[]
for frame in frames:
    p=Image.new('RGB',SIZE,(36,46,40));p.paste(frame,mask=frame.getchannel('A'));previews.append(p)
previews[0].save(OUT/'walk-right-preview.gif',save_all=True,append_images=previews[1:],duration=120,loop=0,disposal=2)
(OUT/'art.json').write_text(json.dumps({'frameWidth':256,'frameHeight':320,'frameCount':8,
    'frameDurationMs':120,'upperSource':'../druid-eight-way-v1/walk-right-256x320.png',
    'master':'leg-master.png','cycleMs':960,'stridePixels':36,'maxFootLiftPixels':5,
    'layerOrder':['far-side staff','far leg','near leg','original garments'],
    'staticOldLegLayer':False,'poses':registrations},indent=2)+'\n')
