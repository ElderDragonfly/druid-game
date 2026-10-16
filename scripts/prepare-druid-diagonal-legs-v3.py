"""Balanced rear half-cycles and front-idle brown palette, legs only.

The accepted front-diagonal geometry is retained exactly. Two drawn rear
half-cycles replace the old similarity-sorted poses: contact/passing for
each foot. Upper bodies, garment contours and staff are retained.
Requires Pillow, NumPy and SciPy.
"""
import json
from pathlib import Path
import runpy

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_dilation, label
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-diagonal-legs-v3'
PREVIOUS = ROOT / 'docs/art/druid-diagonal-legs-v2'
BASE = ROOT / 'docs/art/druid-eight-way-v1'
v2 = runpy.run_path(str(ROOT / 'scripts/prepare-druid-diagonal-legs-v2.py'))
rgba, cells, clean, strip, preview = (v2[n] for n in ('rgba', 'cells', 'clean', 'strip', 'preview'))
DIRECTIONS = v2['DIRECTIONS']
SIZE = (256, 320)
WEIGHTS = np.array((.2126, .7152, .0722))


def rear_half(path):
    source = rgba(path)
    pixels = np.array(source)
    regions, _ = label(pixels[:, :, 3] >= 128, np.ones((3, 3)))
    sizes = np.bincount(regions.ravel())
    ids = sorted(np.argsort(sizes[1:])[-4:] + 1,
                 key=lambda n: np.where(regions == n)[1].min())
    yy, xx = np.indices(regions.shape)
    poses = []
    for n in ids:
        y, _ = np.where(regions == n)
        top, bottom = int(y.min()), int(y.max() + 1)
        waist = (regions == n) & (yy < top + .08 * (bottom - top))
        anchor = float(np.median(xx[waist]))
        waist_width = float(np.quantile(xx[waist], .95) - np.quantile(xx[waist], .05))
        part = pixels.copy(); part[regions != n] = 0
        poses.append((Image.fromarray(part), top, bottom, anchor, waist_width))
    # A constant scale for the entire half-cycle, not a moving-foot anchor.
    # Both separately drawn sheets share hip width and hip-to-ground height.
    sy = 115 / max(bottom - top for _, top, bottom, _, _ in poses)
    sx = 44 / np.median([width for _, _, _, _, width in poses])
    return [clean(image.transform(SIZE, Image.Transform.AFFINE,
            (1 / sx, 0, anchor - 128 / sx, 0, 1 / sy, top - 185 / sy),
            Image.Resampling.BICUBIC))
            for image, top, _, anchor, _ in poses]


def brown_mask(image):
    data = np.array(image)
    hsv = np.array(image.convert('RGB').convert('HSV'))
    return ((data[:, :, 3] > 0) & (hsv[:, :, 0] >= 6) &
            (hsv[:, :, 0] <= 33) & (hsv[:, :, 1] >= 35) & (hsv[:, :, 2] >= 22))


def reference_browns():
    image = rgba(ROOT / 'docs/art/druid-front-refinement-v2/idle-down-256x320.png')
    mask = Image.new('1', SIZE)
    draw = ImageDraw.Draw(mask)
    # Only the actual trousers and boots, never tunic trim, cloak or staff.
    polygons = (
        ((85, 219), (109, 228), (118, 225), (119, 237), (108, 248), (94, 250), (82, 244), (81, 233)),
        ((138, 216), (157, 211), (168, 212), (168, 228), (160, 237), (146, 237)),
        ((92, 252), (107, 251), (105, 268), (109, 285), (104, 294), (93, 296), (86, 290), (88, 274)),
        ((147, 242), (160, 240), (169, 251), (175, 258), (173, 266), (160, 270), (146, 260)),
    )
    for polygon in polygons: draw.polygon(polygon, fill=1)
    return np.array(image)[:, :, :3][np.array(mask) & brown_mask(image)]


def match_browns(frames, visible):
    """Transfer tone distribution, then use exact original RGBs.

    Old nearest-RGB matching mapped light generated leather to the brightest
    original swatches, making the whole lower body too light. Each source set
    gets one fixed monotonic lookup shared by every phase, never per-frame
    correction. The target samples are identical for front and rear views.
    """
    reference = reference_browns()
    samples = np.concatenate([np.array(f)[:, :, :3][brown_mask(f) & mask]
                              for f, mask in zip(frames, visible)])
    q = np.linspace(0, 1, 257)
    source_luma, target_luma = np.quantile(samples @ WEIGHTS, q), np.quantile(reference @ WEIGHTS, q)
    source_luma, unique = np.unique(source_luma, return_index=True)
    target_luma = target_luma[unique]
    levels, shades = [], []
    light = reference @ WEIGHTS
    for lo in range(0, 256, 3):
        band = (light >= lo) & (light < lo + 3)
        if band.any():
            levels.append(float(np.median(light[band])))
            shades.append(np.median(reference[band], axis=0))
    palette = np.unique(reference, axis=0)
    tree = cKDTree(palette.astype(float))
    shades = np.array(shades)
    result = []
    for frame in frames:
        data = np.array(frame); mask = brown_mask(frame)
        colors, inverse = np.unique(data[:, :, :3][mask], axis=0, return_inverse=True)
        tone = np.interp(colors @ WEIGHTS, source_luma, target_luma)
        wanted = np.stack([np.interp(tone, levels, shades[:, c]) for c in range(3)], axis=-1)
        data[:, :, :3][mask] = palette[tree.query(wanted)[1]][inverse]
        result.append(clean(Image.fromarray(data)))
    return result


def body_layers(direction, count):
    accepted = cells(rgba(BASE / f'walk-{direction}-256x320.png'))
    originals = v2['v1']['protected_pixels'](direction)
    result = []
    for i in range(count):
        phase = i * 4 // count
        original = accepted[phase]
        legacy_keep, staff = originals[phase]
        keep = v2['garment_mask'](original, direction, legacy_keep)
        garment_alpha = keep & (np.array(original)[:, :, 3] > 0)
        result.append((original, staff, keep, garment_alpha))
    return result


def main():
    down = cells(rgba(PREVIOUS / 'legs-down-right-256x320.png'))
    # Use matching contact/passing drawings from each half. The extra source
    # poses repeat a raised right foot but prematurely plant the left one;
    # merely giving those eight drawings equal durations retains the limp.
    up = (rear_half(OUT / 'legs-up-right-half-a-source.png')[:2] +
          rear_half(OUT / 'legs-up-right-half-b-source.png')[:2])
    legs_by_view = {'down-right': down, 'up-right': up}
    for direction, legs in legs_by_view.items():
        visible = [~garment for _, _, _, garment in body_layers(direction, len(legs))]
        legs_by_view[direction] = match_browns(legs, visible)
    walking, metadata = {}, {}
    yy, _ = np.indices((320, 256))
    for direction in DIRECTIONS:
        legs = legs_by_view[direction.replace('left', 'right')]
        if direction.endswith('left'):
            mirrored = []
            for leg in legs:
                image = Image.new('RGBA', SIZE)
                image.paste(leg.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (1, 0))
                mirrored.append(image)
            legs = mirrored
        frames, masks, garment_masks, overlaps = [], [], [], []
        layers = body_layers(direction, len(legs))
        for leg, (original, staff, keep, garment_alpha) in zip(legs, layers):
            pixels = np.array(leg)
            shadow = binary_dilation(garment_alpha, iterations=2) & ~garment_alpha
            shadow &= (pixels[:, :, 3] > 0) & (yy >= 195)
            pixels[shadow, :3] = np.rint(pixels[shadow, :3] * .78).astype('uint8')
            new_leg = Image.fromarray(pixels)
            if direction.endswith('left'):
                frame = new_leg.copy(); keep |= np.array(staff)[:, :, 3] > 0
            else:
                frame = staff.copy(); frame.alpha_composite(new_leg)
            overlay = np.array(original); overlay[~keep] = 0
            frame.alpha_composite(Image.fromarray(overlay))
            frame.paste(original.crop((0, 0, 256, 195)), (0, 0))
            frame, keep = v2['cleanup'](frame, keep)
            frames.append(frame)
            mask = np.zeros((320, 256, 4), dtype=np.uint8); mask[keep] = 255
            masks.append(Image.fromarray(mask))
            garment = np.zeros_like(mask); garment[garment_alpha] = 255
            garment_masks.append(Image.fromarray(garment))
            overlaps.append(int(((np.array(leg)[:, :, 3] > 0) & garment_alpha & (yy >= 195)).sum()))
        for name, image in (('legs', strip(legs)), ('protected', strip(masks)),
                            ('garment', strip(garment_masks)), ('walk', strip(frames))):
            clean(image).save(OUT / f'{name}-{direction}-256x320.png', optimize=True)
        preview(strip(frames)).save(OUT / f'walk-{direction}-frames-preview.png', optimize=True)
        walking[direction] = frames
        metadata[direction] = {'frameCount': len(frames), 'frameDurationMs': 960 // len(frames),
                              'bodyPhases': [i * 4 // len(frames) for i in range(len(frames))],
                              'garmentOverlapPixels': overlaps}
    palette = preview(strip([f for frames in walking.values() for f in frames])).quantize(
        colors=256, dither=Image.Dither.NONE)
    for direction, frames in walking.items():
        gifs = [preview(frame).quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
        gifs[0].save(OUT / f'walk-{direction}-preview.gif', save_all=True, append_images=gifs[1:],
                     duration=960 // len(frames), loop=0, disposal=2, optimize=False)
    (OUT / 'art.json').write_text(json.dumps({
        'integrated': True, 'frameWidth': 256, 'frameHeight': 320, 'cycleDurationMs': 960,
        'directions': metadata, 'rearHalfCycles': [
            {'support': 'left', 'swing': 'right', 'frames': [0, 1], 'durationMs': 480},
            {'support': 'right', 'swing': 'left', 'frames': [2, 3], 'durationMs': 480}],
        'rearSourcePoses': ['half-a:0', 'half-a:1', 'half-b:0', 'half-b:1'],
        'brownReference': 'druid-front-refinement-v2/idle-down-256x320.png',
        'brownTransfer': 'fixed per-source tone lookup; exact original trouser/boot palette',
        'frontGeometry': 'v2 leg alpha and pose order retained exactly',
        'preserved': 'accepted upper body, cloak, staff, all idle and cardinal art',
        'shear': False}, indent=2) + '\n')
    print('Balanced contact/passing rear phases; diagonal trousers/boots use the original dark brown palette.')


if __name__ == '__main__': main()
