"""Eight views: drawn idle/diagonal poses, shared front-idle cloth palette.

Pillow/NumPy/SciPy handle crop registration, palette transfer and assembly only.
New character poses are drawn in the checked-in source sheets.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import label, map_coordinates, binary_dilation, binary_fill_holes, distance_transform_edt
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-eight-way-v1'
SIZE = (256, 320)
BG = (38, 54, 40, 255)
DIRECTIONS = ('down', 'left', 'right', 'up', 'down-left', 'down-right', 'up-left', 'up-right')
REFERENCE = ROOT / 'docs/art/druid-front-refinement-v2/idle-down-256x320.png'


def rgba(path):
    return Image.open(path).convert('RGBA')


def clean(image):
    data = np.array(image)
    data[:, :, 3] = np.where(data[:, :, 3] >= 128, 255, 0)
    data[data[:, :, 3] == 0] = 0
    return Image.fromarray(data)


def save(image, name):
    clean(image).save(OUT / name, optimize=True)


def cloth_mask(image):
    data = np.array(image)
    hsv = np.array(image.convert('RGB').convert('HSV'))
    return (data[:, :, 3] >= 128) & (hsv[:, :, 0] >= 30) & (hsv[:, :, 0] <= 105) & (hsv[:, :, 1] >= 42)


def palette_match(frames):
    """One fixed color lookup per direction, shared by all its idle/walk phases.

    Transfer cloth lightness distribution, then choose exact front-idle RGBs.
    Never quantize the whole figure or recolor wood, skin, beard or boots.
    """
    reference = rgba(REFERENCE)
    ref = np.array(reference)[:, :, :3][cloth_mask(reference)]
    palette = np.unique(ref, axis=0)
    weights = np.array((.2126, .7152, .0722))
    ref_light = ref @ weights
    samples = np.concatenate([np.array(f)[:, :, :3][cloth_mask(f)] for f in frames])
    source_light = samples @ weights
    quantiles = np.linspace(0, 1, 257)
    old, new = np.quantile(source_light, quantiles), np.quantile(ref_light, quantiles)
    old, unique = np.unique(old, return_index=True)
    new = new[unique]
    # Smooth the reference hue within narrow lightness bins. Sorting arbitrary
    # RGBs by luma alone creates speckles where equal lumas have different hues.
    bins = np.arange(0, 257, 4)
    shades, levels = [], []
    for lo, hi in zip(bins[:-1], bins[1:]):
        band = (ref_light >= lo) & (ref_light < hi)
        if band.any():
            shades.append(np.median(ref[band], axis=0)); levels.append(np.median(ref_light[band]))
    shades = np.array(shades)
    tree = cKDTree(palette.astype(float))
    result = []
    for frame in frames:
        data = np.array(frame)
        mask = cloth_mask(frame)
        colors, inverse = np.unique(data[:, :, :3][mask], axis=0, return_inverse=True)
        target = np.interp(colors @ weights, old, new)
        wanted = np.stack([np.interp(target, levels, shades[:, c]) for c in range(3)], axis=-1)
        indices = tree.query(wanted)[1]
        data[:, :, :3][mask] = palette[indices][inverse]
        result.append(clean(Image.fromarray(data)))
    return result


def split_poses(path, count, columns):
    image = rgba(path)
    data = np.array(image)
    components, _ = label(data[:, :, 3] >= 128, np.ones((3, 3)))
    counts = np.bincount(components.ravel())
    ids = np.argsort(counts[1:])[-count:] + 1
    rows = count // columns
    ids = sorted(ids, key=lambda n: (int(np.where(components == n)[0].min() / (image.height / rows)),
                                    np.where(components == n)[1].min()))
    yy, xx = np.indices(components.shape)
    hsv = np.array(image.convert('RGB').convert('HSV'))
    poses = []
    for i, n in enumerate(ids):
        y, x = np.where(components == n)
        top, bottom = int(y.min()), int(y.max() + 1)
        hint = (i % columns + .5) * image.width / columns
        hood = (components == n) & (yy < top + .19 * (bottom - top)) & (abs(xx - hint) < image.width / columns * .28)
        hood &= (hsv[:, :, 0] >= 30) & (hsv[:, :, 0] <= 105) & (hsv[:, :, 1] >= 42)
        if not hood.any(): raise ValueError(f'No hood found: {path}, pose {i}')
        hood_top = int(np.where(hood)[0].min())
        anchor = float(np.median(xx[hood]))
        pixels = data.copy()
        pixels[components != n] = 0
        poses.append({'image': Image.fromarray(pixels), 'top': hood_top, 'bottom': bottom, 'anchor': anchor})
    return poses


def render(pose, scale):
    return clean(pose['image'].transform(SIZE, Image.Transform.AFFINE,
        (1 / scale, 0, pose['anchor'] - 128 / scale, 0, 1 / scale, pose['top'] - 20 / scale),
        Image.Resampling.BICUBIC))


def strip(frames):
    image = Image.new('RGBA', (256 * len(frames), 320))
    for i, frame in enumerate(frames): image.paste(frame, (i * 256, 0))
    return image


def preview(image):
    bg = Image.new('RGBA', image.size, BG)
    bg.alpha_composite(image)
    return bg.convert('RGB')


def idles():
    poses = split_poses(OUT / 'idle-turnaround-source.png', 8, 4)
    directions = ('up', 'left', 'right', 'down', *DIRECTIONS[4:])
    result = {direction: render(pose, 280 / (pose['bottom'] - pose['top']))
              for direction, pose in zip(directions, poses)}
    result['down'] = rgba(REFERENCE)
    # Use only the new resting legs beneath the accepted rear cloak/arms.
    old = ROOT / 'docs/art/druid-back-refinement-v1'
    legs = np.array(result['up'])
    yy, xx = np.indices((320, 256))
    legs[(yy < 210) | (xx < 90) | (xx > 172)] = 0
    planted = Image.new('RGBA', SIZE)
    left_leg, right_leg = legs.copy(), legs.copy()
    left_leg[:, 132:] = 0; right_leg[:, :132] = 0
    # A relaxed staggered stance: feet spread, one foot slightly farther away
    # in the ground plane, rather than both ankles pressed together.
    planted.paste(Image.fromarray(left_leg), (-4, -8))
    other = Image.new('RGBA', SIZE); other.paste(Image.fromarray(right_leg), (3, 0))
    planted.alpha_composite(other)
    # The original cloak occludes the top of the planted legs naturally.
    frame = rgba(old / 'walk-arm-staff-256x320.png').crop((0, 0, 256, 320))
    frame.alpha_composite(planted)
    frame.alpha_composite(rgba(old / 'walk-cloak-motion-256x320.png').crop((0, 0, 256, 320)))
    frame.alpha_composite(rgba(old / 'walk-right-arm-region-256x320.png').crop((0, 0, 256, 320)))
    result['up'] = clean(frame)
    return result


def cells(image):
    return [image.crop((i * 256, 0, (i + 1) * 256, 320)) for i in range(4)]


def solid_body(image):
    """Close enclosed cloth pinholes, retaining the natural gap between legs."""
    data = np.array(image)
    alpha = data[:, :, 3] > 0
    yy, xx = np.indices(alpha.shape)
    holes = binary_fill_holes(alpha) & ~alpha & ((yy < 235) | (xx < 85) | (xx > 180))
    if holes.any():
        nearest = distance_transform_edt(~alpha, return_distances=False, return_indices=True)
        data[holes] = data[nearest[0][holes], nearest[1][holes]]
    # Remove only small disconnected scraps, not small details in the figure.
    regions, n = label(data[:, :, 3] > 0, np.ones((3, 3)))
    for i in range(1, n + 1):
        if (regions == i).sum() < 9: data[regions == i] = 0
    return clean(Image.fromarray(data))


def rear_walk():
    old = ROOT / 'docs/art/druid-back-refinement-v1'
    cloaks = cells(rgba(old / 'walk-cloak-motion-256x320.png'))
    legs = cells(rgba(old / 'walk-legs-256x320.png'))
    arms = cells(rgba(old / 'walk-right-arm-region-256x320.png'))
    staffs = cells(rgba(old / 'walk-arm-staff-256x320.png'))
    poses = split_poses(OUT / 'walk-up-shoulders-source.png', 4, 2)
    scale = 280 / max(p['bottom'] - p['top'] for p in poses)
    drawn = [render(p, scale) for p in poses]
    yy, xx = np.indices((320, 256))
    frames = []
    for i, cloak in enumerate(cloaks):
        data, new = np.array(cloak), np.array(drawn[i])
        mask = cloth_mask(cloak) & cloth_mask(drawn[i])
        # Drawn shoulder folds blend into the accepted hood and lower cloak.
        weight = np.clip((yy - 67) / 20, 0, 1) * np.clip((205 - yy) / 35, 0, 1) * mask
        arm_neighborhood = (xx >= 160) & (yy >= 104) & (yy < 198)
        weight[arm_neighborhood] = 0
        data[:, :, :3] = np.rint(data[:, :, :3] * (1 - weight[:, :, None]) + new[:, :, :3] * weight[:, :, None]).astype('uint8')
        # Small counterrotation of the two shoulders, not whole-body rocking.
        sway = (1, 0, -1, 0)[i]
        envelope = np.clip((yy - 65) / 20, 0, 1) * np.clip((166 - yy) / 30, 0, 1)
        envelope *= np.clip((168 - xx) / 12, 0, 1)
        dy = sway * np.clip((xx - 128) / 30, -1.8, 1.8) * envelope
        coords = np.array([yy - dy, xx])
        cloth = Image.fromarray(np.stack([map_coordinates(data[:, :, c], coords,
            order=0, mode='constant', cval=0) for c in range(4)], axis=-1))
        frame = staffs[i].copy()
        frame.alpha_composite(legs[i]); frame.alpha_composite(cloth); frame.alpha_composite(arms[i])
        frames.append(solid_body(frame))
    return frames


def left_hand_peek(frames):
    """Only the far free wrist briefly emerges; the near staff hand stays intact."""
    source = rgba(ROOT / 'docs/art/druid-front-refinement-v2/idle-down-256x320.png')
    data = np.array(source)
    hsv = np.array(source.convert('HSV'))
    yy, xx = np.indices((320, 256))
    skin = (xx < 107) & (xx > 65) & (yy > 160) & (yy < 201)
    skin &= (hsv[:, :, 0] > 4) & (hsv[:, :, 0] < 28) & (hsv[:, :, 1] > 65) & (hsv[:, :, 2] > 120)
    region = binary_dilation(skin, iterations=1) & (data[:, :, 3] > 0)
    data[~region] = 0
    hand = Image.fromarray(data); hand = hand.crop(hand.getbbox())
    result = []
    for i, body in enumerate(frames):
        # Behind the body: a 0/3/6/3 px excursion makes the wrist reveal gradual.
        alpha = np.array(body)[:, :, 3]
        edge = int(np.where(alpha[177] > 0)[0].min())
        layer = Image.new('RGBA', SIZE)
        layer.paste(hand, (edge - (0, 3, 6, 3)[i], 174 + (0, -1, 0, 1)[i]))
        layer.alpha_composite(body)
        result.append(solid_body(layer))
    return result


def diagonal_walks():
    alternates = split_poses(OUT / 'walk-alternate-step-source.png', 4, 2)
    result = {}
    for direction, alternate in zip(DIRECTIONS[4:], alternates):
        poses = split_poses(OUT / f'walk-{direction}-body-source.png', 4, 2)
        scale = 280 / max(p['bottom'] - p['top'] for p in poses)
        bodies = [render(p, scale) for p in poses]
        bodies[2] = render(alternate, 280 / (alternate['bottom'] - alternate['top']))
        head = bodies[0].crop((0, 0, 256, 97))
        for body in bodies: body.paste(head, (0, 0))
        # Reuse the already accepted full-leg gait, not the generated sheets'
        # repeated leading foot. The new torso/cloth/free-arm poses still move.
        if direction.startswith('down'):
            gait = cells(rgba(ROOT / 'docs/art/druid-front-refinement-v2/walk-body-256x320.png'))
        else:
            gait = cells(rgba(ROOT / 'docs/art/druid-back-refinement-v1/walk-legs-256x320.png'))
        corrected = []
        yy, xx = np.indices((320, 256))
        for body, legs in zip(bodies, gait):
            layer = np.array(legs)
            layer[(yy < 217) | (xx < 85) | (xx > 180)] = 0
            shear = -.14 if direction.endswith('left') else .14
            planted = Image.fromarray(layer).transform(SIZE, Image.Transform.AFFINE,
                (1, -shear, shear * 217, 0, 1, 0), Image.Resampling.NEAREST)
            pixels = np.array(body)
            hsv = np.array(body.convert('RGB').convert('HSV'))
            # Near-black boot outlines have unstable HSV hue; they are not
            # olive cloth and must not become long retained vertical strips.
            fabric = cloth_mask(body) & (hsv[:, :, 0] >= 34) & (hsv[:, :, 2] >= 35)
            fabric = binary_dilation(fabric, iterations=1)
            # The cloak ends above each column's last olive pixel. Keep its
            # complete cloth/trim contour, not isolated brown pixels from legs.
            hem = np.max(np.where(fabric & (yy >= 195), yy, -10), axis=0)
            retained = yy <= hem[None, :] + 3
            pixels[(yy >= 225) & ~retained] = 0
            planted.alpha_composite(Image.fromarray(pixels))
            corrected.append(solid_body(planted))
        bodies = corrected
        master = rgba(OUT / f'arm-staff-{direction}.png')
        if direction == 'up-right':
            # The far shaft is hidden by the idle's near arm and boots. Use a
            # complete accepted far-left arm/staff, never fragments of those boots.
            full_staff = rgba(ROOT / 'docs/art/druid-side-refinement-v1/walk-right-arm-staff-256x320.png').crop((0, 0, 256, 320))
            master = Image.new('RGBA', SIZE); master.paste(full_staff, (-8, -7))
        frames = []
        for i, body in enumerate(bodies):
            if direction == 'down-right':
                # The source intentionally omits the far forearm. Its open
                # white cuff must not overpaint the separate rigid forearm.
                pixels = np.array(body)
                yy, xx = np.indices((320, 256))
                cuff = (xx >= 167) & (xx < 213) & (yy >= 108) & (yy < 153) & ~cloth_mask(body)
                pixels[cuff] = 0
                body = Image.fromarray(pixels)
            staff = Image.new('RGBA', SIZE)
            staff.paste(master, (0, -(0, 6, 12, 6)[i]))
            if direction.endswith('left'):
                frame = body.copy(); frame.alpha_composite(staff)
            else:
                frame = staff.copy(); frame.alpha_composite(body)
            frames.append(solid_body(frame))
        result[direction] = frames
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--idles-only', action='store_true')
    args = parser.parse_args()
    standing = idles()
    if args.idles_only:
        for direction, frame in standing.items(): save(frame, f'idle-{direction}-uncolored.png')
        return
    walking = diagonal_walks()
    walking['up'] = rear_walk()
    walking['down'] = cells(rgba(ROOT / 'docs/art/druid-front-refinement-v2/walk-down-256x320.png'))
    for direction in ('left', 'right'):
        walking[direction] = cells(rgba(ROOT / f'docs/art/druid-side-refinement-v1/walk-{direction}-256x320.png'))
    walking['left'] = left_hand_peek(walking['left'])
    final = {}
    for direction in DIRECTIONS:
        frames = palette_match([standing[direction], *walking[direction]])
        if direction == 'down': frames[0] = rgba(REFERENCE)  # exact canonical reference, unchanged
        save(frames[0], f'idle-{direction}-256x320.png')
        save(strip(frames[1:]), f'walk-{direction}-256x320.png')
        preview(strip(frames[1:])).save(OUT / f'walk-{direction}-frames-preview.png', optimize=True)
        final[direction] = frames
    all_previews = strip([f for frames in final.values() for f in frames])
    palette = preview(all_previews).quantize(colors=256, dither=Image.Dither.NONE)
    for direction, frames in final.items():
        gif = [preview(f).quantize(palette=palette, dither=Image.Dither.NONE) for f in frames[1:]]
        gif[0].save(OUT / f'walk-{direction}-preview.gif', save_all=True, append_images=gif[1:],
            duration=240, loop=0, disposal=2, optimize=False)
    contact = Image.new('RGBA', (1024, 640), BG)
    for i, direction in enumerate(DIRECTIONS): contact.alpha_composite(final[direction][0], (i % 4 * 256, i // 4 * 320))
    contact.convert('RGB').save(OUT / 'idle-eight-directions-preview.png', optimize=True)
    (OUT / 'art.json').write_text(json.dumps({'integrated': True, 'directions': DIRECTIONS,
        'frameWidth': 256, 'frameHeight': 320, 'frameCount': 4, 'frameDurationMs': 240,
        'paletteReference': str(REFERENCE.relative_to(ROOT)), 'clothMapping': 'shared reference RGB palette, fixed per-direction lightness lookup',
        'staffHand': 'anatomical-left', 'diagonalStaffLift': [0, 6, 12, 6],
        'rearShoulderTiltPx': [1.8, 0, -1.8, 0], 'separateIdlePoses': True,
        'diagonalLegGait': 'accepted front/rear full legs, hip-anchored shear +/-0.14, alternating footfalls'}, indent=2) + '\n')
    print('Eight detailed directions prepared, separate idles and shared cloth palette.')


if __name__ == '__main__': main()
