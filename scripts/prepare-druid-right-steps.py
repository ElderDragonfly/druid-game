"""Reuse the accepted left leg cycle only; keep right-facing torso and staff."""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy.ndimage import binary_dilation, distance_transform_edt
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/art/druid-walk-right-v2'
OUT.mkdir(exist_ok=True)
right=Image.open(ROOT/'docs/art/druid-eight-way-v1/walk-right-256x320.png').convert('RGBA')
left=Image.open(ROOT/'docs/art/druid-side-refinement-v1/walk-left-body-256x320.png').convert('RGBA')
staff=Image.open(ROOT/'docs/art/druid-side-refinement-v1/walk-right-arm-staff-256x320.png').convert('RGBA')
# Masks follow the garment hem, keeping the cloak in front of the legs.
# Staff-free donor prevents a reflected second staff from entering the cycle.
left_edges=[[(96,221),(136,232),(162,223),(166,248),(173,265),(201,278),(201,306),(55,306),(55,267),(96,249)],
 [(96,222),(137,232),(162,224),(168,254),(191,266),(191,300),(76,306),(76,274),(104,250)],
 [(95,221),(136,230),(163,222),(166,249),(178,265),(201,280),(201,306),(56,306),(56,268),(97,249)],
 [(96,222),(137,232),(163,224),(168,254),(191,266),(191,300),(76,306),(76,274),(104,250)]]
right_edges=[[(77,220),(113,230),(153,221),(155,242),(149,250),(162,266),(194,280),(194,306),(40,306),(40,269),(76,250)]]*4
frames=[]
for i in range(4):
 box=(i*256,0,(i+1)*256,320)
 original=right.crop(box)
 donor=left.crop(box)
 m=Image.new('L',(256,320));ImageDraw.Draw(m).polygon([(96,210),(162,210)]+left_edges[i][3:],fill=255)
 a=np.array(donor); a[:,:,3]=np.minimum(a[:,:,3],np.array(m))
 hsv=np.array(donor.convert('RGB').convert('HSV'))
 yy,xx=np.indices(a.shape[:2])
 # Warm boot highlights overlap the cloak hue: mask only its outer edges.
 cloth=(hsv[:,:,0]>=32)&(hsv[:,:,0]<=110)&(hsv[:,:,1]>40)&(a[:,:,3]>0)
 cloth &= ((xx>162)&(yy<268))|((xx<98)&(yy<249))
 a[:,:,3][binary_dilation(cloth,iterations=1)]=0
 a[a[:,:,3]==0]=0
 legs=ImageOps.mirror(Image.fromarray(a))
 removal=Image.new('L',(256,320));ImageDraw.Draw(removal).polygon(right_edges[i],fill=255)
 fg=np.array(original)
 hsv=np.array(original.convert('RGB').convert('HSV'))
 cloak=(hsv[:,:,0]>=32)&(hsv[:,:,0]<=110)&(hsv[:,:,1]>40)&(fg[:,:,3]>0)
 yy,xx=np.indices(cloak.shape)
 cloak &= ((xx<84)&(yy<260))|((xx>144)&(yy<248))
 protect=binary_dilation(cloak,iterations=2)&(fg[:,:,3]>0)
 fg[:,:,3][(np.array(removal)>0)&~protect]=0;fg[fg[:,:,3]==0]=0
 # Restore the actual far-side staff where old legs previously covered it.
 frame=staff.crop(box)
 # The left donor had this upper-leg area hidden by a differently shaped cloak.
 # Retain the matching right-facing trousers underneath, so the new knee never
 # ends in a transparent cut just below the old cloak. Feet stay donor-only.
 underlay=np.array(original)
 yy,xx=np.indices(underlay.shape[:2])
 bridge=Image.new('L',(256,320))
 ImageDraw.Draw(bridge).polygon([(69,246),(118,246),(118,258),(94,269),(74,264),(69,258)],fill=255)
 support=((xx>=70)&(xx<118)&(yy>=220)&(yy<258))|(np.array(bridge)>0)
 underlay[:,:,3][~support]=0
 # The original right layer also has no pixels in this tiny hidden-knee gap.
 # Extend its nearest existing trouser texture under the cloak; no new foot.
 hues=np.array(original.convert('RGB').convert('HSV'))
 cloth_source=(np.array(original)[:,:,3]>0)&(hues[:,:,0]<32)&(hues[:,:,2]>10)&(xx>=70)&(xx<118)&(yy>=230)&(yy<270)
 nearest=distance_transform_edt(~cloth_source,return_distances=False,return_indices=True)
 fill=(np.array(bridge)>0)&(underlay[:,:,3]==0)
 underlay[fill]=np.array(original)[nearest[0][fill],nearest[1][fill]]
 underlay[underlay[:,:,3]==0]=0
 frame.alpha_composite(Image.fromarray(underlay))
 frame.alpha_composite(legs)
 frame.alpha_composite(Image.fromarray(fg))
 # Absolutely preserve the approved upper body, hand and staff motion.
 frame.paste(original.crop((0,0,256,220)),(0,0))
 frames.append(frame)
strip=Image.new('RGBA',(1024,320))
for i,f in enumerate(frames):strip.paste(f,(i*256,0))
strip.save(OUT/'walk-right-256x320.png',optimize=True)
bg=(36,46,40)
previews=[]
for f in frames:
 p=Image.new('RGB',f.size,bg);p.paste(f,mask=f.getchannel('A'));previews.append(p)
previews[0].save(OUT/'walk-right-preview.gif',save_all=True,append_images=previews[1:],duration=240,loop=0,disposal=2)
preview=Image.new('RGB',strip.size,bg);preview.paste(strip,mask=strip.getchannel('A'));preview.save(OUT/'walk-right-frames-preview.png')
(OUT/'art.json').write_text(json.dumps({'frameWidth':256,'frameHeight':320,'frameCount':4,'frameDurationMs':240,'donor':'druid-side-refinement-v1/walk-left-body-256x320.png','preserved':'right-facing upper body, cloak, hand and far-side staff'},indent=2)+'\n')
