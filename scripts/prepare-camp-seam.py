"""Stitch only the old x=525 seam; reuse accepted animation deltas on that base."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/art/selection-camp-seam-v1'
old=np.array(Image.open(ROOT/'docs/art/selection-camp-atmosphere-v1/environment-reference.png').convert('RGBA'))
repair=np.array(Image.open(OUT/'repair-source.png').convert('RGBA').resize((960,540),Image.Resampling.NEAREST))
result=old.copy()
# Repair the visible geometric join only. Fade the new patch into unchanged art.
for x in range(503,554):
 weight=min(1,(x-503)/13,(553-x)/13)
 result[:,x,:3]=np.rint(old[:,x,:3]*(1-weight)+repair[:,x,:3]*weight).astype('uint8')
# The obsolete plate footer is not part of the forest: keep the original full-height ground.
base=Image.open(ROOT/'src/assets/selection-camp.png').convert('RGBA').resize((384,216),Image.Resampling.NEAREST).resize((960,540),Image.Resampling.NEAREST)
result[528:]=np.array(base)[528:]
# Fade the old static flame-removal repair into the rock instead of exposing
# its sharp perimeter as a horizontal patch. Imported flame pixels stay exact.
fire_folder=ROOT/'docs/art/selection-camp-uploaded-flame-v1'
fire_reference=np.array(Image.open(fire_folder/'fire-reference.png').convert('RGBA'))
old_clean=np.array(Image.open(fire_folder/'fire-base.png').convert('RGBA'))
# Soften the perimeter of the existing reconstruction rather than cutting a
# rectangle into the rock. Keep the accepted coals/logs below row 125 exact.
changed=np.any(old_clean!=fire_reference,axis=2)
weight=np.minimum(1,distance_transform_edt(changed)/12)
weight[125:]=changed[125:]
fire_area=result[282:430,584:712]
fire_area[:]=np.rint(fire_area.astype(float)*(1-weight[:,:,None])+old_clean.astype(float)*weight[:,:,None]).astype('uint8')
Image.fromarray(np.rint(weight*255).astype('uint8')).save(OUT/'fire-clean-mask.png')
Image.fromarray(fire_area).save(OUT/'fire-base.png',optimize=True)
Image.fromarray(fire_area).save(OUT/'fire-reference.png',optimize=True)
# The accepted imported flame is independent of the background reconstruction.
flames=Image.open(fire_folder/'flame-only-frames.png').convert('RGBA')
fire_frames=Image.new('RGBA',flames.size)
for frame in range(37):
 x=frame%8*128;y=frame//8*148
 cell=Image.fromarray(fire_area).copy()
 cell.alpha_composite(flames.crop((x,y,x+128,y+148)))
 fire_frames.paste(cell,(x,y))
fire_frames.save(OUT/'fire-frames.png',optimize=True)
Image.fromarray(result).save(OUT/'background.png',optimize=True)
# Preserve the accepted flow and timing; its opaque rectangle must share the repaired background.
folder=ROOT/'docs/art/selection-water-flow-v2'
reference=np.array(Image.open(folder/'water-reference.png').convert('RGBA'))
frames=np.array(Image.open(folder/'water-frames.png').convert('RGBA'))
new_reference=result[245:387,408:612].copy()
for y in range(0,frames.shape[0],142):
 for x in range(0,frames.shape[1],204):
  original=frames[y:y+142,x:x+204].astype('int16')
  frames[y:y+142,x:x+204]=np.clip(original+new_reference.astype('int16')-reference.astype('int16'),0,255).astype('uint8')
Image.fromarray(new_reference).save(OUT/'water-reference.png',optimize=True)
# Only the flowing water is drawn over the background at runtime. A transparent
# guard prevents opaque rectangle edges at fractional camera zooms in WebGL.
mask=np.array(Image.open(folder/'water-change-mask.png').convert('L'))>0
mask[:2]=False;mask[-2:]=False;mask[:,:2]=False;mask[:,-2:]=False
water_overlay=np.zeros_like(frames)
for index in range(144):
 y=index//8*142;x=index%8*204
 cell=frames[y:y+142,x:x+204]
 cell[~mask]=new_reference[~mask]
 overlay=water_overlay[y:y+142,x:x+204]
 overlay[mask]=cell[mask]
Image.fromarray(frames).save(OUT/'water-frames.png',optimize=True)
Image.fromarray(water_overlay).save(OUT/'water-overlay-frames.png',optimize=True)
(OUT/'art.json').write_text(json.dumps({'size':[960,540],'repairColumns':[503,553],'seamX':525,'footerRestoredFromY':528,'water':'accepted v2 deltas, unchanged cadence and masks','fire':'accepted flame-only frames over a feathered static cleanup, exact coals/logs, no hard rock-patch edge','characterAndStaff':'separate, unchanged'},indent=2)+'\n')
