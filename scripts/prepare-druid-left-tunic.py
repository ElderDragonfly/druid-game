"""Match left-facing tunic panels to the accepted front-view palette.

Only RGB inside the tunic changes. Standing/walking use the same colour lookup;
all silhouettes, garment texture, legs, cloak, staff and gestures stay intact.
"""
from pathlib import Path
import json

import numpy as np
from PIL import Image, ImageDraw
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'docs/art'
OUT = ART / 'druid-left-tunic-v1'
OUT.mkdir(exist_ok=True)


def polygon(points):
    mask = Image.new('L', (256, 320))
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return np.array(mask) > 0


def packed(colors):
    colors = colors.astype('uint32')
    return colors[:, 0] * 65536 + colors[:, 1] * 256 + colors[:, 2]


def luminance(colors):
    return colors.astype(float) @ np.array([.2126, .7152, .0722])


# Follow each drawing's panel seams, leaving rope and beige hem trim intact.
SHAPES = {
    'walk': {
        'green': [
            [(127, 147), (140, 160), (145, 181), (154, 202), (159, 216), (129, 222), (123, 216), (124, 186)],
            [(112, 151), (117, 152), (114, 184), (112, 208), (111, 214), (99, 209), (104, 187)],
        ],
        'center': [(118, 151), (126, 148), (123, 185), (123, 218), (114, 215), (115, 184)],
    },
    'idle': {
        'green': [
            [(126, 141), (138, 159), (142, 181), (150, 207), (149, 215), (126, 218), (123, 211), (123, 183)],
            [(110, 149), (114, 150), (110, 177), (108, 203), (106, 209), (99, 207), (103, 180)],
        ],
        'center': [(115, 150), (125, 143), (122, 184), (123, 211), (111, 213), (111, 181)],
    },
}
reference = Image.open(ART / 'druid-eight-way-v1/idle-down-256x320.png').convert('RGBA')
r = np.array(reference)
hsv = np.array(reference.convert('RGB').convert('HSV'))
green = (polygon([(91, 151), (111, 158), (110, 187), (111, 208), (85, 198), (86, 178)])
         & (hsv[:, :, 0] >= 32) & (hsv[:, :, 0] <= 85) & (r[:, :, 3] > 0))
center = (polygon([(126, 164), (137, 162), (141, 191), (145, 201), (127, 207)])
          & (hsv[:, :, 0] < 36) & (r[:, :, 3] > 0))
references = {'green': r[:, :, :3][green], 'center': r[:, :, :3][center]}
inputs = {kind: Image.open(ART / f'druid-facing-fixes-v1/{kind}-left-256x320.png').convert('RGBA')
          for kind in SHAPES}
masks = {}
for kind, image in inputs.items():
    selected = {name: np.zeros((320, image.width), bool) for name in references}
    for i in range(image.width // 256):
        frame = image.crop((i * 256, 0, (i + 1) * 256, 320))
        a = np.array(frame)
        hsv = np.array(frame.convert('RGB').convert('HSV'))
        for name in references:
            shape = (polygon(SHAPES[kind]['center']) if name == 'center' else
                     np.logical_or.reduce([polygon(points) for points in SHAPES[kind]['green']]))
            # Do not recolour any surrounding green cloak or its dark outline.
            selected[name][:, i * 256:(i + 1) * 256] = (
                shape & (hsv[:, :, 0] < 36) & (hsv[:, :, 2] > 35) & (a[:, :, 3] > 0))
    masks[kind] = selected

lookups = {}
for name, reference_colors in references.items():
    samples = np.concatenate([np.array(image)[:, :, :3][masks[kind][name]]
                              for kind, image in inputs.items()])
    colors, counts = np.unique(samples, axis=0, return_counts=True)
    order = np.argsort(luminance(colors))
    colors, counts = colors[order], counts[order]
    ranks = (np.cumsum(counts) - counts / 2) / counts.sum()
    reference_colors = reference_colors[np.argsort(luminance(reference_colors))]
    matched = reference_colors[np.minimum((ranks * len(reference_colors)).astype(int), len(reference_colors) - 1)]
    keys = packed(colors)
    order = np.argsort(keys)
    lookups[name] = keys[order], matched[order]

counts = {}
for kind, image in inputs.items():
    source = np.array(image)
    a = source.copy()
    for name, (keys, values) in lookups.items():
        mask = masks[kind][name]
        a[:, :, :3][mask] = values[np.searchsorted(keys, packed(source[:, :, :3][mask]))]
    mask = masks[kind]['green'] | masks[kind]['center']
    assert np.array_equal(a[:, :, 3], source[:, :, 3])
    assert np.array_equal(a[~mask], source[~mask])
    Image.fromarray(a).save(OUT / f'{kind}-left-256x320.png', optimize=True)
    Image.fromarray(mask.astype('uint8') * 255).save(OUT / f'{kind}-left-tunic-mask.png', optimize=True)
    counts[kind] = int(np.any(a != source, axis=2).sum())

walk = Image.open(OUT / 'walk-left-256x320.png').convert('RGBA')
previews = []
for i in range(4):
    frame = walk.crop((i * 256, 0, (i + 1) * 256, 320))
    preview = Image.new('RGB', frame.size, (36, 46, 40))
    preview.paste(frame, mask=frame.getchannel('A'))
    previews.append(preview)
previews[0].save(OUT / 'walk-left-preview.gif', save_all=True, append_images=previews[1:],
                 duration=240, loop=0, disposal=2)
(OUT / 'art.json').write_text(json.dumps({
    'reference': '../druid-eight-way-v1/idle-down-256x320.png',
    'previous': '../druid-facing-fixes-v1', 'changedRgbPixels': counts,
    'preserved': 'all alpha; all pixels outside tunic masks; same shared palette for idle and walk',
    'panels': 'muted front-view center and green side panels, existing beige hem trim',
}, indent=2) + '\n')
print('Left tunic pixels recoloured:', counts)

# Hit reactions start/end on the exact standing pose. Keep that invariant and
# carry the same panel palette through the three accepted bent poses too.
hit_source = Image.open(ART / 'druid-hit-side-v1/hit-left-512x384.png').convert('RGBA')
hit = hit_source.copy()
hit_masks = Image.new('L', hit_source.size)
hit_previews = []
for phase in range(5):
    offset = (phase * 512 + 128, 40)
    box = (offset[0], offset[1], offset[0] + 256, offset[1] + 320)
    frame = hit_source.crop(box)
    source = np.array(frame)
    a = source.copy()
    mask = np.zeros((320, 256), bool)
    if phase in (0, 4):
        a = np.array(Image.open(OUT / 'idle-left-256x320.png').convert('RGBA'))
        mask = masks['idle']['green'] | masks['idle']['center']
    else:
        hsv = np.array(frame.convert('RGB').convert('HSV'))
        # The deepest bend moves the front of the tunic four native pixels.
        shift = 4 if phase == 2 else 0
        for name, (keys, values) in lookups.items():
            points = ([SHAPES['idle']['center']] if name == 'center' else SHAPES['idle']['green'])
            region = np.logical_or.reduce([polygon([(px + shift, py) for px, py in points_]) for points_ in points])
            selected = region & (hsv[:, :, 0] < 36) & (hsv[:, :, 2] > 35) & (source[:, :, 3] > 0)
            # Registered hit art used nearest original palette colours. Some
            # RGBs are new to the tunic selection; use the nearest shared source
            # entry rather than introducing a different hit-only green palette.
            palette = np.stack([keys >> 16, (keys >> 8) & 255, keys & 255], axis=1)
            _, nearest = cKDTree(palette.astype(float)).query(source[:, :, :3][selected].astype(float))
            a[:, :, :3][selected] = values[nearest]
            mask |= selected
    assert np.array_equal(a[:, :, 3], source[:, :, 3])
    assert np.array_equal(a[~mask], source[~mask])
    hit.paste(Image.fromarray(a), offset)
    hit_masks.paste(Image.fromarray(mask.astype('uint8') * 255), offset)
    preview = Image.new('RGB', (512, 384), (36, 46, 40))
    full_frame = hit.crop((phase * 512, 0, (phase + 1) * 512, 384))
    preview.paste(full_frame, mask=full_frame.getchannel('A'))
    hit_previews.append(preview)
hit.save(OUT / 'hit-left-512x384.png', optimize=True)
hit_masks.save(OUT / 'hit-left-tunic-mask.png', optimize=True)
hit_previews[0].save(OUT / 'hit-left-preview.gif', save_all=True, append_images=hit_previews[1:],
                      duration=[350, 70, 120, 100, 500], loop=0, disposal=2)
