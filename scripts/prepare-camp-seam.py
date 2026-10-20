"""Stitch only the old x=525 seam; reuse accepted animation deltas on that base."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
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
Image.fromarray(frames).save(OUT/'water-frames.png',optimize=True)
(OUT/'art.json').write_text(json.dumps({'size':[960,540],'repairColumns':[503,553],'seamX':525,'footerRestoredFromY':528,'water':'accepted v2 deltas, unchanged cadence and masks','characterAndStaff':'separate, unchanged'},indent=2)+'\n')
