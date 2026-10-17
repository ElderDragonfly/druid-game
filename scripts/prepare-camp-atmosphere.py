"""Extract local clean patches for the five baked firefly lights.

No approved file is rewritten. The generated clean reference is used ONLY in
small circles around the original lights; animated actors are separate sprites.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/selection-camp-atmosphere-v1'
POINTS = [(229,184),(437,223),(490,260),(741,211),(868,113)]
source = Image.open(OUT / 'firefly-clean-source.png').convert('RGBA').resize((960,540), Image.Resampling.NEAREST)
data = np.array(source)
yy, xx = np.indices((540,960)); alpha = np.zeros((540,960), dtype=float)
for x,y in POINTS:
    distance = np.hypot(xx-x, yy-y)
    alpha = np.maximum(alpha, np.clip((16-distance)/4, 0, 1))
data[:,:,3] = np.rint(alpha * 255).astype('uint8'); data[data[:,:,3] == 0] = 0
Image.fromarray(data).save(OUT / 'firefly-clean-patches.png', optimize=True)
(OUT / 'art.json').write_text(json.dumps({'canvas': [960,540], 'fireflyAnchors': POINTS,
    'patchRadius': 16, 'opaqueRadius': 12, 'source': 'firefly-clean-source.png',
    'outsidePatchesTransparent': True, 'originalsUnchanged': True}, indent=2) + '\n')
