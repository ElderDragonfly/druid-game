"""Cut the two uploaded mushroom groups without recolouring or redrawing.

White JPEG background (including gaps between stems) is removed; pale cream
stems and cap speckles are coloured parts of the drawing and remain intact.
"""
from pathlib import Path
import hashlib
import json

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_fill_holes, distance_transform_edt, label

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'docs/art'
OUT = ART / 'log-mushrooms-v3'
OUT.mkdir(exist_ok=True)
SOURCES = ['4b0b8db07aff0050267f37040ceb7ed9.jpg', '7e7fc479fa99796e96ff1fd405f0d0a4.jpg']
metadata = []
preview = Image.new('RGB', (560, 380), (34, 61, 41))
draw = ImageDraw.Draw(preview)
for index, filename in enumerate(SOURCES):
    path = ART / filename
    rgb = np.array(Image.open(path).convert('RGB'))
    # Neutral near-white is backdrop; the warm cream artwork has a wider
    # RGB spread. Remove it inside the group too, never a global white erosion.
    white = (rgb.min(axis=2) >= 230) & (np.ptp(rgb.astype('int16'), axis=2) <= 18)
    components, _ = label(~white, np.ones((3, 3)))
    sizes = np.bincount(components.ravel())
    sizes[0] = 0
    keep = sizes[components] >= 300
    if index == 0:
        # JPEG blends a few cap-edge pixels with white. They are exterior matte,
        # not a cream outline (unlike the second reference's actual pale rim).
        colors = rgb.astype('int16')
        red = (colors[:, :, 0] - colors[:, :, 1] > 35) & (colors[:, :, 1] < 185) & (colors[:, :, 2] < 150)
        exterior = ~binary_fill_holes(keep)
        pale = (rgb.min(axis=2) > 200) & (np.ptp(colors, axis=2) < 60)
        keep &= ~(pale & (distance_transform_edt(~red) <= 4) & (distance_transform_edt(~exterior) <= 2))
    rgba = np.dstack((rgb, keep.astype('uint8') * 255))
    image = Image.fromarray(rgba)
    x0, y0, x1, y1 = image.getbbox()
    # A transparent guard keeps the exact retained edge pixels away from the
    # texture rectangle. The same crop is recorded for pixel-preservation tests.
    bounds = [max(0, x0 - 2), max(0, y0 - 2), min(image.width, x1 + 2), min(image.height, y1 + 2)]
    image = image.crop(bounds)
    data = np.array(image)
    opaque = data[:, :, 3] > 0
    expected = rgb[bounds[1]:bounds[3], bounds[0]:bounds[2]]
    assert np.array_equal(data[:, :, :3][opaque], expected[opaque])
    image.save(OUT / f'mushroom-{index}.png', optimize=True)
    metadata.append({
        'id': f'mushroom-{index}', 'file': f'mushroom-{index}.png',
        'width': image.width, 'height': image.height,
        'source': str(path.relative_to(ROOT)), 'sourceCrop': bounds,
        'sourceSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'retainedPixels': int(opaque.sum()), 'rgbPreserved': True,
        # Keep the previous mushroom display height/maximum width on the logs.
        'scale': min(22 / image.height, 25 / image.width),
    })
    image.thumbnail((240, 320), Image.Resampling.NEAREST)
    preview.paste(image, (20 + index * 280, 35), image)
    draw.text((20 + index * 280, 10), f'mushroom-{index}', fill='white')
(OUT / 'sprites.json').write_text(json.dumps({'mushrooms': metadata}, ensure_ascii=False, indent=2) + '\n')
preview.save(OUT / 'collection.png')
print([(art['id'], art['width'], art['height'], art['retainedPixels']) for art in metadata])
