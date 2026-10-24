"""Cut nine new mushrooms and sample the uploaded soil; never repaint the references."""
from pathlib import Path
import json
import runpy
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
helper = runpy.run_path(str(ROOT / 'scripts/prepare-witch-circle.py'))
cut = helper['cut']
OUT = ROOT / 'docs/art/witch-circle-v2'; OUT.mkdir(exist_ok=True)
SOURCE = ROOT / 'docs/art/35e7cd8c994abfc4a9704b78fa6e2806 (1).jpg'
SOIL = ROOT / 'docs/art/cf03e46bc0010f66ba0ccf8133753cd9.jpg'
CROPS = [(156,139,254,241),(267,139,356,253),(357,143,467,254),
         (138,244,248,357),(252,250,364,361),(365,254,467,361),
         (134,355,247,463),(254,354,357,465),(363,354,469,465)]
sprites=[]; atlas=Image.new('RGBA',(128*9,128)); preview=Image.new('RGB',(720,390),'#293e2e')
for i,crop in enumerate(CROPS):
    im,bounds=cut(SOURCE,crop,[230,207,181],17)
    im.save(OUT/f'mushroom-{i}.png');atlas.paste(im,(i*128,0))
    sprites.append({'id':f'mushroom-{i}','width':im.width,'height':im.height,
                    'anchorX':im.width//2,'anchorY':im.height-1,'sourceCrop':bounds,
                    'frame':{'x':i*128,'y':0,'width':im.width,'height':im.height}})
    preview.paste(im,(i%6*120+(120-im.width)//2,i//6*145+125-im.height),im)
    ImageDraw.Draw(preview).text((i%6*120+10,i//6*145+129),str(i+1),fill='#d2d6ad')
soil_crop=[28,184,405,432]
soil=Image.open(SOIL).convert('RGB').crop(soil_crop);soil.save(OUT/'soil.png')
shown=soil.resize((210,140),Image.Resampling.NEAREST);preview.paste(shown,(480,160))
preview.save(OUT/'collection.png');atlas.save(OUT/'ring-atlas.png')
central=json.loads((ROOT/'docs/art/witch-circle-v1/sprites.json').read_text())['central']
(OUT/'sprites.json').write_text(json.dumps({'sourceRing':str(SOURCE.relative_to(ROOT)),
    'sourceSoil':str(SOIL.relative_to(ROOT)),'soilCrop':soil_crop,'preservesOpaqueRGB':True,
    'sprites':sprites,'central':central},indent=2)+'\n')
print('Prepared nine new mushrooms and a native soil crop; central composition retained.')
