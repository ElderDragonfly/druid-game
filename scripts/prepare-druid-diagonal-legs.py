"""Replace only diagonal legs with drawn three-quarter views.

Accepted torso, cloth, hand and staff pixels are copied from the active eight
view PNGs. No shearing/rotation of frontal boots. Pillow, NumPy, SciPy.
"""
import json
from pathlib import Path
import runpy

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, label
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-diagonal-legs-v1'
BASE = ROOT / 'docs/art/druid-eight-way-v1'
SIZE = (256, 320)
DIRECTIONS = ('down-left', 'down-right', 'up-left', 'up-right')
old = runpy.run_path(str(ROOT / 'scripts/prepare-druid-eight-way.py'))
rgba, cells, clean, strip, preview = (old[name] for name in ('rgba', 'cells', 'clean', 'strip', 'preview'))


def save(image, name):
    clean(image).save(OUT / name, optimize=True)


def parts(path):
    source = rgba(path)
    data = np.array(source)
    components, _ = label(data[:, :, 3] >= 128, np.ones((3, 3)))
    sizes = np.bincount(components.ravel())
    ids = np.argsort(sizes[1:])[-4:] + 1
    ids = sorted(ids, key=lambda n: (np.where(components == n)[0].min() > source.height / 2,
                                    np.where(components == n)[1].min()))
    yy, xx = np.indices(components.shape)
    result = []
    for n in ids:
        y, x = np.where(components == n)
        top, bottom = int(y.min()), int(y.max() + 1)
        waist = (components == n) & (yy < top + .12 * (bottom - top))
        anchor = float(np.median(xx[waist]))
        pixels = data.copy(); pixels[components != n] = 0
        result.append({'image': Image.fromarray(pixels), 'top': top, 'bottom': bottom, 'anchor': anchor})
    return result


def color_legs(frames):
    reference = rgba(ROOT / 'docs/art/druid-front-refinement-v2/walk-body-256x320.png')
    data = np.array(reference)
    hsv = np.array(reference.convert('RGB').convert('HSV'))
    yy, xx = np.indices(data.shape[:2]); xx %= 256
    samples = (data[:, :, 3] >= 128) & (yy >= 235) & (xx >= 90) & (xx <= 170)
    samples &= (hsv[:, :, 0] >= 7) & (hsv[:, :, 0] <= 30) & (hsv[:, :, 1] >= 45)
    palette = np.unique(data[:, :, :3][samples], axis=0)
    tree = cKDTree(palette.astype(float))
    result = []
    for frame in frames:
        pixels = np.array(frame)
        hsv = np.array(frame.convert('RGB').convert('HSV'))
        brown = (pixels[:, :, 3] > 0) & (hsv[:, :, 0] >= 6) & (hsv[:, :, 0] <= 33) & (hsv[:, :, 1] >= 35)
        colors, inverse = np.unique(pixels[:, :, :3][brown], axis=0, return_inverse=True)
        pixels[:, :, :3][brown] = palette[tree.query(colors.astype(float))[1]][inverse]
        result.append(clean(Image.fromarray(pixels)))
    return result


def leg_frames(path):
    poses = parts(path)
    # One uniform scale for the whole cycle, anchored at the waist, not at a
    # moving boot. Boots' depth is part of the newly drawn projection.
    scale = 115 / max(p['bottom'] - p['top'] for p in poses)
    frames = []
    for p in poses:
        image = p['image'].transform(SIZE, Image.Transform.AFFINE,
            (1 / scale, 0, p['anchor'] - 128 / scale, 0, 1 / scale, p['top'] - 185 / scale),
            Image.Resampling.BICUBIC)
        frames.append(clean(image))
    return color_legs(frames)


def protected_pixels(direction):
    """Reconstruct the original torso/cloth/staff alpha, without its old legs."""
    poses = old['split_poses'](BASE / f'walk-{direction}-body-source.png', 4, 2)
    scale = 280 / max(p['bottom'] - p['top'] for p in poses)
    bodies = [old['render'](p, scale) for p in poses]
    alternate = old['split_poses'](BASE / 'walk-alternate-step-source.png', 4, 2)[DIRECTIONS.index(direction)]
    bodies[2] = old['render'](alternate, 280 / (alternate['bottom'] - alternate['top']))
    master = rgba(BASE / f'arm-staff-{direction}.png')
    if direction == 'up-right':
        staff = rgba(ROOT / 'docs/art/druid-side-refinement-v1/walk-right-arm-staff-256x320.png').crop((0, 0, 256, 320))
        master = Image.new('RGBA', SIZE); master.paste(staff, (-8, -7))
    # Tiny black scraps from the earlier cutout used to blend into the old
    # boots. They are not part of the branch and must not float beside new legs.
    data = np.array(master)
    components, count = label(data[:, :, 3] > 0, np.ones((3, 3)))
    sizes = np.bincount(components.ravel())
    for i in range(1, count + 1):
        if sizes[i] < 8: data[components == i] = 0
    master = Image.fromarray(data)
    yy, xx = np.indices((320, 256))
    result = []
    for i, body in enumerate(bodies):
        pixels = np.array(body)
        hsv = np.array(body.convert('RGB').convert('HSV'))
        fabric = old['cloth_mask'](body) & (hsv[:, :, 0] >= 34) & (hsv[:, :, 2] >= 35)
        fabric = binary_dilation(fabric, iterations=1)
        hem = np.max(np.where(fabric & (yy >= 195), yy, -10), axis=0)
        pixels[(yy >= 225) & (yy > hem[None, :] + 3)] = 0
        if direction == 'down-right':
            cuff = (xx >= 167) & (xx < 213) & (yy >= 108) & (yy < 153) & ~old['cloth_mask'](body)
            pixels[cuff] = 0
        staff = Image.new('RGBA', SIZE); staff.paste(master, (0, -(0, 6, 12, 6)[i]))
        result.append(((yy < 225) | (pixels[:, :, 3] > 0), staff))
    return result


def main():
    right = {d: leg_frames(OUT / f'legs-{d}-source.png') for d in ('down-right', 'up-right')}
    walking = {}
    for direction in DIRECTIONS:
        source = direction.replace('left', 'right')
        legs = right[source]
        if direction.endswith('left'):
            # Plain trousers/boots are symmetric: only the lower-body drawing
            # is mirrored. The accepted character, staff and hands never flip.
            mirrored = []
            for frame in legs:
                image = Image.new('RGBA', SIZE)
                image.paste(frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (1, 0))
                mirrored.append(image)
            legs = mirrored
        accepted = cells(rgba(BASE / f'walk-{direction}-256x320.png'))
        protect = protected_pixels(direction)
        frames, masks = [], []
        for original, leg, (keep, staff) in zip(accepted, legs, protect):
            new = np.array(leg); new[:225] = 0
            if direction.endswith('left'):
                frame = Image.fromarray(new)
                keep = keep | (np.array(staff)[:, :, 3] > 0)
            else:
                # The far shaft is behind the NEW legs. Copying the old full
                # figure at its coordinates would restore strips of OLD boots.
                frame = staff.copy(); frame.alpha_composite(Image.fromarray(new))
            overlay = np.array(original); overlay[~keep] = 0
            frame.alpha_composite(Image.fromarray(overlay))
            frame.paste(original.crop((0, 0, 256, 225)), (0, 0))
            frames.append(clean(frame))
            mask = np.zeros((320, 256, 4), dtype=np.uint8); mask[keep] = 255
            masks.append(Image.fromarray(mask))
        save(strip(legs), f'legs-{direction}-256x320.png')
        save(strip(masks), f'protected-{direction}-256x320.png')
        save(strip(frames), f'walk-{direction}-256x320.png')
        preview(strip(frames)).save(OUT / f'walk-{direction}-frames-preview.png', optimize=True)
        walking[direction] = frames
    palette = preview(strip([frame for frames in walking.values() for frame in frames])).quantize(colors=256, dither=Image.Dither.NONE)
    for direction, frames in walking.items():
        gifs = [preview(frame).quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
        gifs[0].save(OUT / f'walk-{direction}-preview.gif', save_all=True, append_images=gifs[1:],
            duration=240, loop=0, disposal=2, optimize=False)
    (OUT / 'art.json').write_text(json.dumps({'integrated': True, 'directions': DIRECTIONS,
        'frameWidth': 256, 'frameHeight': 320, 'frameCount': 4, 'frameDurationMs': 240,
        'replacedArea': 'legs below y=225; original cloth and staff occlude them',
        'legs': 'drawn front/rear three-quarter right; symmetric legs mirrored for left',
        'preserved': 'all original pixels above y=225 and protected torso/cloak/hand/staff pixels',
        'cleanup': 'discard tiny detached scraps in the old staff cutout below the unchanged upper region',
        'shear': False}, indent=2) + '\n')
    print('Four diagonal walks: drawn turned legs, accepted upper body preserved.')


if __name__ == '__main__': main()
