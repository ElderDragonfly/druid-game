"""Mirror only the accepted left leg cycle, under the original right garments.

The old right trousers/boots are completely removed. No static thigh underlay
or filled patch is composited with the moving legs. Nearest-neighbour fitting
connects the donor's hidden rear thigh to the shorter right cloak instead.
"""
from pathlib import Path
import json

import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy.ndimage import binary_dilation, map_coordinates

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-walk-right-v2'
OUT.mkdir(exist_ok=True)
ART = ROOT / 'docs/art'
right = Image.open(ART / 'druid-eight-way-v1/walk-right-256x320.png').convert('RGBA')
left = Image.open(ART / 'druid-side-refinement-v1/walk-left-body-256x320.png').convert('RGBA')
staff = Image.open(ART / 'druid-side-refinement-v1/walk-right-arm-staff-256x320.png').convert('RGBA')
y, x = np.indices((320, 256))

# Actual lower contours of the four tunic poses, not a rectangular crop.
HEMS = [
    [(75, 214), (82, 222), (104, 231), (116, 233), (119, 226), (127, 226), (150, 218), (158, 214)],
    [(77, 221), (94, 231), (99, 221), (109, 224), (119, 228), (123, 224), (135, 226), (153, 222), (159, 217)],
    [(75, 214), (82, 221), (105, 232), (116, 234), (120, 225), (127, 226), (150, 219), (158, 215)],
    [(78, 221), (94, 232), (99, 222), (108, 226), (120, 228), (124, 224), (137, 226), (155, 221), (160, 215)],
]


def polygon(points):
    mask = Image.new('L', (256, 320))
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return np.array(mask) > 0


def atlas(frames, name):
    image = Image.new('RGBA', (1024, 320))
    for i, frame in enumerate(frames):
        image.paste(frame, (i * 256, 0))
    image.save(OUT / name, optimize=True)
    return image


frames, leg_layers, foregrounds = [], [], []
for i in range(4):
    box = (i * 256, 0, (i + 1) * 256, 320)
    original, donor = right.crop(box), left.crop(box)
    a = np.array(donor)
    hsv = np.array(donor.convert('RGB').convert('HSV'))
    selection = polygon([(96, 210), (162, 210), (166, 248), (174, 266), (202, 278),
                         (202, 307), (54, 307), (54, 267), (96, 249)])
    # Below the donor cloak the complete boot contours are visible, including
    # the raised heel. A diagonal crop here used to clip off that heel.
    selection |= y >= 268
    a[~selection] = 0
    # Remove donor cloak/outline only at its edges; warm boot highlights inside
    # the silhouette overlap its hue and must stay intact.
    cloak = ((hsv[:, :, 0] >= 32) & (hsv[:, :, 0] <= 110) & (hsv[:, :, 1] > 40)
             & (a[:, :, 3] > 0) & (((x > 162) & (y < 268)) | ((x < 98) & (y < 249))))
    a[binary_dilation(cloak, iterations=2)] = 0
    legs = np.array(ImageOps.mirror(Image.fromarray(a)))
    # Fit the donor's occluded thigh to the right cloak with one continuous leg
    # surface. Below y=270 all foot positions, colours and stride remain donor-only.
    shift = np.interp(y, [0, 220, 246, 254, 270, 319], [0, 0, 12, 12, 0, 0])
    shift *= np.clip((137 - x) / 35, 0, 1)
    coordinates = np.array([y, x + shift])
    legs = np.stack([map_coordinates(legs[:, :, channel], coordinates, order=0,
                                    mode='constant', cval=0) for channel in range(4)], axis=2)
    legs[legs[:, :, 3] == 0] = 0

    fg = np.array(original)
    hsv = np.array(original.convert('RGB').convert('HSV'))
    cloak = ((hsv[:, :, 0] >= 32) & (hsv[:, :, 0] <= 110) & (hsv[:, :, 1] > 40)
             & (fg[:, :, 3] > 0) & (((x < 84) & (y < 264)) | ((x > 144) & (y < 250))))
    protected_cloak = binary_dilation(cloak, iterations=1) & (fg[:, :, 3] > 0)
    # Hue alone also selected a few warm pixels from the old calf. This is
    # strictly below the cloak: none of the old leg belongs in the foreground.
    protected_cloak &= ~((x < 100) & (y >= 263))
    tunic = polygon([(0, 0), (255, 0), (255, 210)] + list(reversed(HEMS[i])) + [(0, 210)])
    fg[~(protected_cloak | tunic | (y < 220))] = 0
    leg_layer, foreground = Image.fromarray(legs), Image.fromarray(fg)
    frame = staff.crop(box)
    frame.alpha_composite(leg_layer)
    frame.alpha_composite(foreground)
    frame.paste(original.crop((0, 0, 256, 220)), (0, 0))
    assert np.array_equal(np.array(frame)[:220], np.array(original)[:220])
    assert not np.any(fg[263:270, 70:100, 3]), 'Old calf left over the moving leg'
    assert set(np.unique(np.array(frame)[:, :, 3])) <= {0, 255}
    frames.append(frame)
    leg_layers.append(leg_layer)
    foregrounds.append(foreground)

strip = atlas(frames, 'walk-right-256x320.png')
atlas(leg_layers, 'legs-right-256x320.png')
atlas(foregrounds, 'foreground-right-256x320.png')
background = (36, 46, 40)
previews = []
for frame in frames:
    preview = Image.new('RGB', frame.size, background)
    preview.paste(frame, mask=frame.getchannel('A'))
    previews.append(preview)
previews[0].save(OUT / 'walk-right-preview.gif', save_all=True, append_images=previews[1:],
                 duration=240, loop=0, disposal=2)
preview = Image.new('RGB', strip.size, background)
preview.paste(strip, mask=strip.getchannel('A'))
preview.save(OUT / 'walk-right-frames-preview.png')
(OUT / 'art.json').write_text(json.dumps({
    'frameWidth': 256, 'frameHeight': 320, 'frameCount': 4, 'frameDurationMs': 240,
    'donor': 'druid-side-refinement-v1/walk-left-body-256x320.png',
    'preserved': 'right upper body y<220, hand, staff, scale and timing',
    'layerOrder': ['original far-side staff', 'one mirrored moving leg layer', 'original garments'],
    'staticLegUnderlay': False, 'sampling': 'nearest; foot placement unchanged below y=270',
}, indent=2) + '\n')
