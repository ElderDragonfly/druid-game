"""Contour-joined diagonal legs: fuller trousers, grounded eight-frame rear gait."""
import json
import itertools
from pathlib import Path
import runpy

import numpy as np
from PIL import Image
from scipy.ndimage import binary_closing, binary_dilation, binary_fill_holes, label

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-diagonal-legs-v2'
BASE = ROOT / 'docs/art/druid-eight-way-v1'
v1 = runpy.run_path(str(ROOT / 'scripts/prepare-druid-diagonal-legs.py'))
rgba, cells, clean, strip, preview = (v1[name] for name in ('rgba', 'cells', 'clean', 'strip', 'preview'))
SIZE = (256, 320)
DIRECTIONS = ('down-left', 'down-right', 'up-left', 'up-right')


def save(image, name):
    clean(image).save(OUT / name, optimize=True)


def drawn_legs(direction, count):
    source = rgba(OUT / f'legs-{direction}-source.png')
    data = np.array(source)
    components, _ = label(data[:, :, 3] >= 128, np.ones((3, 3)))
    sizes = np.bincount(components.ravel())
    ids = np.argsort(sizes[1:])[-count:] + 1
    ids = sorted(ids, key=lambda n: (np.where(components == n)[0].min() > source.height / 2,
                                    np.where(components == n)[1].min()))
    yy, xx = np.indices(components.shape)
    poses = []
    for n in ids:
        y, _ = np.where(components == n)
        top, bottom = int(y.min()), int(y.max() + 1)
        waist = (components == n) & (yy < top + .12 * (bottom - top))
        pixels = data.copy(); pixels[components != n] = 0
        poses.append((Image.fromarray(pixels), top, bottom, float(np.median(xx[waist]))))
    scale = 115 / max(bottom - top for _, top, bottom, _ in poses)
    frames = [clean(image.transform(SIZE, Image.Transform.AFFINE,
        (1 / scale, 0, anchor - 128 / scale, 0, 1 / scale, top - 185 / scale),
        Image.Resampling.BICUBIC)) for image, top, _, anchor in poses]
    return v1['color_legs'](frames)


def garment_mask(original, direction, legacy):
    """Follow the actual olive cloak and tan tunic, including their hem outline.

    Old brown trousers are removed even above y=225. A horizontal cut here was
    the visible seam in v1. Color seeds are connected to the upper garment;
    isolated olive-like highlights on boots cannot enter this mask.
    """
    data = np.array(original)
    hsv = np.array(original.convert('RGB').convert('HSV'))
    yy, xx = np.indices((320, 256))
    if direction.startswith('up'):
        # This junction was already hidden by the accepted rear cloak.
        return legacy.copy()
    alpha = data[:, :, 3] > 0
    seed = alpha & (hsv[:, :, 0] >= 24) & (hsv[:, :, 0] <= 105)
    seed &= (hsv[:, :, 1] >= 35) & (hsv[:, :, 2] >= 28)
    tan = alpha & (hsv[:, :, 0] >= 18) & (hsv[:, :, 0] <= 30)
    tan &= (hsv[:, :, 1] >= 50) & (hsv[:, :, 1] <= 140) & (hsv[:, :, 2] >= 45)
    if direction.startswith('down'):
        seed |= tan & (yy < 233) & (xx >= 82) & (xx <= 178)
    else:
        seed |= tan & binary_dilation(seed, iterations=3)
    closed = binary_closing(seed, iterations=2)
    regions, n = label(closed, np.ones((3, 3)))
    garment = np.zeros_like(alpha)
    for i in range(1, n + 1):
        part = regions == i
        if part.sum() >= 60 and np.any(part & (yy < 195)):
            garment |= part
    garment = binary_fill_holes(garment)
    garment = binary_dilation(garment, iterations=1) & alpha
    # Keep the accepted dark cape lining/outline outside the front trouser
    # opening, and its complete lower contour. Only the visible hip sockets
    # between tunic and trousers need the material boundary above y=225.
    garment |= legacy & (yy >= 225)
    garment |= (yy < 225) & ((xx < 88) | (xx > 174))
    return garment | (yy < 195)


def ordered_rear(frames):
    """Keep opposite footfall at phase 5 and group similar passing poses.

    The source sheet's numbered order repeats a lifted foot between planted
    poses. Choose the smooth closed order of these drawings, without blending
    feet or inventing geometry. Both footfall anchors remain half a cycle apart.
    """
    samples = [np.array(f)[240:, :, :].astype(float) / 255 for f in frames]
    cost = np.zeros((8, 8))
    for i in range(8):
        for j in range(8):
            cost[i, j] = np.abs(samples[i][:, :, 3] - samples[j][:, :, 3]).mean()
            cost[i, j] += .15 * np.abs(samples[i][:, :, :3] - samples[j][:, :, :3]).mean()
    def score(order): return sum(cost[a, b] for a, b in zip(order, (*order[1:], order[0])))
    candidates = ((0, *p[:3], 4, *p[3:]) for p in itertools.permutations((1, 2, 3, 5, 6, 7)))
    order = min(candidates, key=score)
    return [frames[i] for i in order], list(order)


def cleanup(frame, keep):
    data = np.array(frame)
    regions, n = label(data[:, :, 3] > 0, np.ones((3, 3)))
    for i in range(1, n + 1):
        part = regions == i
        if part.sum() < 8:
            data[part] = 0; keep[part] = False
    return clean(Image.fromarray(data)), keep


def main():
    right = {'down-right': drawn_legs('down-right', 4), 'up-right': drawn_legs('up-right', 8)}
    right['up-right'], rear_order = ordered_rear(right['up-right'])
    walking, metadata = {}, {}
    yy, _ = np.indices((320, 256))
    for direction in DIRECTIONS:
        legs = right[direction.replace('left', 'right')]
        if direction.endswith('left'):
            mirrored = []
            for leg in legs:
                frame = Image.new('RGBA', SIZE)
                frame.paste(leg.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (1, 0)); mirrored.append(frame)
            legs = mirrored
        count = len(legs)
        accepted = cells(rgba(BASE / f'walk-{direction}-256x320.png'))
        original_layers = v1['protected_pixels'](direction)
        frames, masks, garment_masks, joins = [], [], [], []
        for i, leg in enumerate(legs):
            body_phase = i * 4 // count
            original = accepted[body_phase]
            legacy_keep, staff = original_layers[body_phase]
            keep = garment_mask(original, direction, legacy_keep)
            old_pixels = np.array(original)
            garment_alpha = keep & (old_pixels[:, :, 3] > 0)
            pixels = np.array(leg)
            # Legs reach behind the garment; only a tiny contact shadow is
            # added to their pixels immediately below the contoured hem.
            shadow = binary_dilation(garment_alpha, iterations=2) & ~garment_alpha
            shadow &= (pixels[:, :, 3] > 0) & (yy >= 195)
            pixels[shadow, :3] = np.rint(pixels[shadow, :3] * .78).astype('uint8')
            new_leg = Image.fromarray(pixels)
            if direction.endswith('left'):
                frame = new_leg.copy()
                keep |= np.array(staff)[:, :, 3] > 0
            else:
                frame = staff.copy(); frame.alpha_composite(new_leg)
            overlay = old_pixels.copy(); overlay[~keep] = 0
            frame.alpha_composite(Image.fromarray(overlay))
            frame.paste(original.crop((0, 0, 256, 195)), (0, 0))
            frame, keep = cleanup(frame, keep)
            frames.append(frame)
            mask = np.zeros((320, 256, 4), dtype=np.uint8); mask[keep] = 255
            masks.append(Image.fromarray(mask))
            cover = np.zeros_like(mask); cover[garment_alpha] = 255
            garment_masks.append(Image.fromarray(cover))
            joins.append(int(((np.array(leg)[:, :, 3] > 0) & garment_alpha & (yy >= 195)).sum()))
        save(strip(legs), f'legs-{direction}-256x320.png')
        save(strip(masks), f'protected-{direction}-256x320.png')
        save(strip(garment_masks), f'garment-{direction}-256x320.png')
        save(strip(frames), f'walk-{direction}-256x320.png')
        preview(strip(frames)).save(OUT / f'walk-{direction}-frames-preview.png', optimize=True)
        walking[direction] = frames
        metadata[direction] = {'frameCount': count, 'frameDurationMs': 960 // count,
            'bodyPhases': [i * 4 // count for i in range(count)], 'garmentOverlapPixels': joins}
    # Reuse the approved preview palette so the unchanged cloak looks identical.
    palette = Image.open(ROOT / 'docs/art/druid-diagonal-legs-v1/walk-down-right-preview.gif')
    for direction, frames in walking.items():
        gifs = [preview(frame).quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
        gifs[0].save(OUT / f'walk-{direction}-preview.gif', save_all=True, append_images=gifs[1:],
            duration=960 // len(frames), loop=0, disposal=2, optimize=False)
    (OUT / 'art.json').write_text(json.dumps({'integrated': True, 'frameWidth': 256, 'frameHeight': 320,
        'cycleDurationMs': 960, 'directions': metadata, 'legThickness': 'redrawn about 20 percent fuller',
        'join': 'legs overlap behind actual tunic/cloak contour; contact shadow only on legs',
        'preserved': 'all pixels above y=195, plus actual garment and staff pixels',
        'rearGait': 'eight evenly timed grounded walking poses, fixed hip registration',
        'rearSourcePoseOrder': rear_order,
        'shear': False}, indent=2) + '\n')
    print('Fuller diagonal legs joined under clothing contours; rear cycles have eight grounded phases.')


if __name__ == '__main__': main()
