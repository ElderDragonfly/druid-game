"""Mechanically extract all eight plants; preserve opaque source RGB values."""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import label

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/art/df05d851182e3aef99da299fb3ce8cb5.jpg'
OUT = ROOT / 'docs/art/forest-bushes-v1'
OUT.mkdir(exist_ok=True)
CROPS = [(58, 28, 248, 124), (266, 40, 404, 125), (30, 182, 162, 278),
         (170, 146, 326, 280), (352, 155, 492, 258), (25, 324, 174, 400),
         (174, 319, 326, 401), (348, 300, 543, 395)]
source = Image.open(SOURCE).convert('RGB')
background = np.array([110, 109, 81])
cell_w, cell_h = 200, 144
atlases = {name: Image.new('RGBA', (cell_w * 8, cell_h)) for name in ('foliage', 'ground')}
preview = Image.new('RGB', (800, 352), '#243b2a')
sprites = []
for index, crop in enumerate(CROPS):
    rgb = np.array(source.crop(crop))
    mask = np.linalg.norm(rgb.astype(float) - background, axis=2) > 36
    components, count = label(mask)
    sizes = np.bincount(components.ravel())
    mask &= sizes[components] >= 6
    yy, xx = np.where(mask)
    bounds = (int(xx.min()), int(yy.min()), int(xx.max()) + 1, int(yy.max()) + 1)
    x0, y0, x1, y1 = bounds
    rgb, mask = rgb[y0:y1, x0:x1], mask[y0:y1, x0:x1]
    h, w = mask.shape
    # Only the lime ground swatches below the leaves use the ground layer.
    # The combined two layers reproduce the extracted sprite without recoloring.
    r, g, b = rgb.astype(float).transpose(2, 0, 1)
    ground = mask & (r > 145) & (g > 180) & (b < 130) & (g > r * 1.03)
    ground[:round(h * .62)] = False
    rgba = np.dstack((rgb, mask.astype('uint8') * 255))
    whole = Image.fromarray(rgba)
    whole.save(OUT / f'bush-{index}.png')
    for name, alpha in [('foliage', mask & ~ground), ('ground', ground)]:
        layer = Image.fromarray(np.dstack((rgb, alpha.astype('uint8') * 255)))
        atlases[name].paste(layer, (index * cell_w, 0))
    preview.paste(whole, (index % 4 * 200 + (200 - w) // 2, index // 4 * 176 + 150 - h), whole)
    ImageDraw.Draw(preview).text((index % 4 * 200 + 10, index // 4 * 176 + 158), str(index + 1), fill='#d5d8ad')
    sprites.append({'id': f'bush-{index}', 'width': w, 'height': h,
                    'anchorX': w // 2, 'anchorY': h - 3,
                    'sourceCrop': [crop[0] + x0, crop[1] + y0, crop[0] + x1, crop[1] + y1],
                    'frame': {'x': index * cell_w, 'y': 0, 'width': w, 'height': h}})
for name, atlas in atlases.items():
    atlas.save(OUT / f'{name}-atlas.png')
preview.save(OUT / 'collection.png')
(OUT / 'sprites.json').write_text(json.dumps({'source': str(SOURCE.relative_to(ROOT)),
    'backgroundRGB': background.tolist(), 'backgroundTolerance': 36,
    'scale': 1, 'preservesOpaqueRGB': True, 'sprites': sprites}, indent=2) + '\n')
print(f'Extracted {len(sprites)} plants with unchanged RGB and separate ground/foliage layers.')
