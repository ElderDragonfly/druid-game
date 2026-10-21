"""Complete hips/thighs/calves behind the preserved mirrored left leg poses.

The generated completion is used only where the approved mirrored source has
no pixels. Original boots, stride, upper body and all known brown pixels stay
exact; the finished lower body is one complete reusable layer per pose.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import binary_closing, binary_erosion, distance_transform_edt, label
from scipy.spatial import cKDTree

ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'docs/art'
PREVIOUS=ART/'druid-walk-right-v4'
OUT=ART/'druid-walk-right-v5'
OUT.mkdir(exist_ok=True)
original_legs=Image.open(PREVIOUS/'legs-right-256x320.png').convert('RGBA')
completion=Image.open(OUT/'completion-source.png').convert('RGBA')
garments=Image.open(PREVIOUS/'garments-256x320.png').convert('RGBA')
staff=Image.open(ART/'druid-side-refinement-v1/walk-right-arm-staff-256x320.png').convert('RGBA')
upper=Image.open(ART/'druid-eight-way-v1/walk-right-256x320.png').convert('RGBA')
y,x=np.indices((320,256))


def complete(index):
    original=np.array(original_legs.crop((index*256,0,(index+1)*256,320)))
    # The 2x2 inpaint reference was x=40..200/y=200..306 from each pose.
    column,row=index%2,index//2
    cell=completion.crop((round(column*completion.width/2),round(row*completion.height/2),
                          round((column+1)*completion.width/2),round((row+1)*completion.height/2)))
    cell=cell.resize((160,106),Image.Resampling.NEAREST)
    registered=Image.new('RGBA',(256,320));registered.paste(cell,(40,200))
    paint=np.array(registered)
    # The front lower leg is already intact. Restrict inpainting to missing hip
    # and rear-leg material; never overlay old/new boots or a second calf.
    allowed=((y<239)&(x>=80)&(x<=165))|((y>=239)&(y<268)&(x>=60)&(x<125))
    missing=allowed&(paint[:,:,3]>=200)&(original[:,:,3]==0)
    # Preserve the material footprint of the original right hip beneath its
    # own tunic. This is upper thigh only, never the old calf/foot silhouettes.
    right=np.array(upper.crop((index*256,0,(index+1)*256,320)))
    socket=(right[:,:,3]>0)&(y>=220)&(y<=238)&(x>=95)&(x<=159)
    socket_missing=socket&(original[:,:,3]==0)
    missing|=socket_missing
    filled=(original[:,:,3]>0)|missing
    # Seal narrow extraction notches, retaining the real gap between the legs.
    notches=binary_closing(filled,iterations=1)&~filled&(y>=207)&(y<268)
    missing|=notches
    interior=binary_erosion(paint[:,:,3]>=200,iterations=1)
    nearest=distance_transform_edt(~interior,return_distances=False,return_indices=True)
    repair=np.zeros_like(paint)
    repair[missing]=paint[missing]
    extrapolated=notches|(socket_missing&(paint[:,:,3]<200))
    repair[extrapolated]=paint[nearest[0][extrapolated],nearest[1][extrapolated]]
    repair[:,:,3][missing]=255
    palette=np.unique(original[:,:,:3][original[:,:,3]>0],axis=0)
    _,ids=cKDTree(palette.astype(float)).query(repair[:,:,:3][missing].astype(float))
    repair[:,:,:3][missing]=palette[ids]
    result=Image.fromarray(repair);result.alpha_composite(Image.fromarray(original))
    data=np.array(result)
    assert np.array_equal(data[original[:,:,3]>0],original[original[:,:,3]>0])
    assert np.array_equal(data[268:],original[268:])
    assert label(data[:,:,3]>0)[1]==1, 'Each boot must connect to the completed hips'
    return result,Image.fromarray(repair)


def strip(frames,name):
    atlas=Image.new('RGBA',(1024,320))
    for i,frame in enumerate(frames):atlas.paste(frame,(i*256,0))
    atlas.save(OUT/name,optimize=True)
    return atlas


frames,legs,repairs=[],[],[]
for index in range(4):
    box=(index*256,0,(index+1)*256,320)
    completed,repair=complete(index)
    frame=staff.crop(box)
    frame.alpha_composite(completed)
    frame.alpha_composite(garments.crop(box))
    frame.paste(upper.crop((index*256,0,(index+1)*256,220)),(0,0))
    assert np.array_equal(np.array(frame)[:220],np.array(upper.crop(box))[:220])
    frames.append(frame);legs.append(completed);repairs.append(repair)
strip(legs,'legs-right-complete-256x320.png')
strip(repairs,'reconstructed-material-256x320.png')
atlas=strip(frames,'walk-right-256x320.png')
preview=Image.new('RGB',atlas.size,(36,46,40));preview.paste(atlas,mask=atlas.getchannel('A'))
preview.save(OUT/'walk-right-frames-preview.png')
previews=[]
for frame in frames:
    image=Image.new('RGB',(256,320),(36,46,40));image.paste(frame,mask=frame.getchannel('A'));previews.append(image)
previews[0].save(OUT/'walk-right-preview.gif',save_all=True,append_images=previews[1:],duration=240,loop=0,disposal=2)
(OUT/'art.json').write_text(json.dumps({'frameWidth':256,'frameHeight':320,'frameCount':4,
    'frameDurationMs':240,'cycleMs':960,'previous':'../druid-walk-right-v4',
    'completionSource':'completion-source.png','originalLegPixelsPreserved':True,
    'bootsBelowY':268,'upperPreservedAboveY':220,
    'layerOrder':['far-side staff','complete lower body','original right garments'],
    'oldHipPatchUsed':False},indent=2)+'\n')
