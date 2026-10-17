"""Pack Basic04 camp artwork as independent environment, actor and staff layers.

Pose/background reconstruction was drawn in the retained source PNGs. Only the
old actor silhouette is replaced in the environment; all outside pixels remain
exact. No previously accepted artwork is overwritten.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import label, binary_dilation, binary_fill_holes

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-basic-seated-v1'
SIZE = (696, 864)
reference = Image.open(OUT / 'camp-reference.png').convert('RGBA')
clean_source = Image.open(OUT / 'camp-clean-source.png').convert('RGBA').resize(SIZE, Image.Resampling.NEAREST)
mask_image = Image.new('L', SIZE)
draw = ImageDraw.Draw(mask_image)
draw.polygon([(395,302),(451,304),(490,351),(497,390),(510,417),(554,428),(560,477),
 (539,501),(559,528),(558,573),(550,600),(536,637),(536,681),(472,685),(452,650),
 (423,649),(411,675),(341,680),(326,658),(334,624),(296,617),(286,576),(298,531),
 (317,471),(330,428),(353,404),(377,391),(382,342)], fill=255)
draw.polygon([(514,308),(522,283),(556,260),(598,255),(597,307),(576,342),
 (566,382),(550,406),(522,384)], fill=255)
draw.rectangle((505, 244, 618, 690), fill=255)
mask = binary_dilation(np.array(mask_image) > 0, iterations=8)
plate = np.array(reference); repair = np.array(clean_source)
plate[mask] = repair[mask]; plate[:, :, 3] = 255
assert np.array_equal(plate[~mask], np.array(reference)[~mask])
Image.fromarray(plate).save(OUT / 'camp-clean-plate.png', optimize=True)
Image.fromarray((mask * 255).astype('uint8')).save(OUT / 'camp-edit-mask.png')

source = Image.open(OUT / 'seated-source.png').convert('RGBA')
data = np.array(source)
components, count = label(data[:, :, 3] >= 180, np.ones((3, 3)))
sizes = np.bincount(components.ravel()); sizes[0] = 0
largest = np.argsort(sizes)[-2:][::-1]
assert sizes[largest[0]] > sizes[largest[1]] * 3, 'Expected a separate body and staff'
outputs = {}
for component, kind in zip(largest, ('druid-seated', 'staff-lying')):
    selected = components == component
    holes = binary_fill_holes(selected) & ~selected
    hole_labels, _ = label(holes); hole_sizes = np.bincount(hole_labels.ravel())
    selected |= holes & (hole_sizes[hole_labels] <= 4)
    pixels = data.copy(); pixels[:, :, 3] = selected * 255; pixels[~selected] = 0
    crop = Image.fromarray(pixels); crop = crop.crop(crop.getbbox())
    if kind == 'druid-seated':
        height = 180; width = round(crop.width * height / crop.height)
        position = (435 - width, 310)
    else:
        width = 200; height = round(crop.height * width / crop.width)
        position = (270, 690)
    # A common 2-native-pixel grid keeps the detailed Basic04 readable in this camp.
    crop = crop.resize((width, height), Image.Resampling.NEAREST).resize((width * 2, height * 2), Image.Resampling.NEAREST)
    layer = Image.new('RGBA', SIZE); layer.paste(crop, position)
    layer.save(OUT / f'{kind}.png', optimize=True); outputs[kind] = layer
    assert set(np.unique(np.array(layer)[:, :, 3])).issubset({0, 255})
assert not np.any((np.array(outputs['druid-seated'])[:, :, 3] > 0) & (np.array(outputs['staff-lying'])[:, :, 3] > 0))
preview = Image.fromarray(plate); preview.alpha_composite(outputs['staff-lying']); preview.alpha_composite(outputs['druid-seated'])
preview.save(OUT / 'camp-preview.png', optimize=True)
metadata = {'canvas': list(SIZE), 'worldPosition': [525, 50], 'worldScale': .625,
            'characterBounds': outputs['druid-seated'].getbbox(), 'staffBounds': outputs['staff-lying'].getbbox(),
            'nativePixelGrid': 2, 'backgroundRepairedPixels': int(mask.sum()),
            'outsideMaskExact': True, 'bodyAndStaffDisjoint': True,
            'identityReference': 'docs/art/druid-sprites-v1/druid-04-basic.png',
            'layers': ['camp-clean-plate.png', 'staff-lying.png', 'druid-seated.png']}
(OUT / 'art.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
