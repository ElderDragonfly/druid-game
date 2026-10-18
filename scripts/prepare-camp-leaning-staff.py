"""Register the separately drawn leaning staff without changing actor/background."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import label

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-camp-staff-leaning-v1'
CAMP = ROOT / 'docs/art/druid-basic-seated-v1'
source = np.array(Image.open(OUT/'staff-source.png').convert('RGBA'))
components,_ = label(source[:,:,3] >= 180, np.ones((3,3)))
sizes=np.bincount(components.ravel()); sizes[0]=0
keep=components==sizes.argmax()
source[:,:,3]=keep*255; source[~keep]=0
staff=Image.fromarray(source); staff=staff.crop(staff.getbbox())
height=190; width=round(staff.width*height/staff.height)
staff=staff.resize((width,height),Image.Resampling.NEAREST).resize((width*2,height*2),Image.Resampling.NEAREST)
layer=Image.new('RGBA',(696,864)); layer.paste(staff,(532,390))
body=Image.open(CAMP/'druid-seated.png').convert('RGBA')
assert not np.any((np.array(body)[:,:,3]>0)&(np.array(layer)[:,:,3]>0)), 'Staff must stay beside the seated actor'
layer.save(OUT/'staff-leaning.png',optimize=True)
preview=Image.open(CAMP/'camp-clean-plate.png').convert('RGBA')
preview.alpha_composite(layer); preview.alpha_composite(body)
preview.save(OUT/'camp-preview.png',optimize=True)
(OUT/'art.json').write_text(json.dumps({'canvas':[696,864],'nativePixelGrid':2,'staffBounds':layer.getbbox(),
  'position':[532,390],'staffSize':list(staff.size),'bodyAndStaffDisjoint':True,
  'bodyAndBackground':'unchanged files in ../druid-basic-seated-v1','pose':'Base on ground; upper shaft rests against the right end of the log'},indent=2)+'\n')
print('Registered leaning staff:',layer.getbbox())
