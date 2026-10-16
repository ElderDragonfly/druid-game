"""Rear diagonal walk with opposite contact poses and continuous shoulders.

Reuses the accepted upper drawings before the old y=97 head splice. Crop,
registration, palette transfer and layer assembly only; new legs are drawn.
"""
import json
from pathlib import Path
import runpy

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, label
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-rear-diagonal-walk-v4'
BASE = ROOT / 'docs/art/druid-eight-way-v1'
v3 = runpy.run_path(str(ROOT / 'scripts/prepare-druid-diagonal-legs-v3.py'))
old = v3['v2']['v1']['old']
rgba, cells, clean, strip, preview = (v3[n] for n in ('rgba', 'cells', 'clean', 'strip', 'preview'))
SIZE = (256, 320)
DIRECTIONS = ('up-left', 'up-right')


def single_leg_cycle():
    """Four drawn whole-leg poses, registered by thigh root and boot sole.

    Actual contact positions move in both axes along the ground projection.
    Registration uses the thigh/sole anchors and retains the drawn perspective.
    A shared width adjustment preserves the accepted sturdy calf/boot volume.
    The far leg uses these same poses half a cycle later, at its own hip.
    """
    source = rgba(OUT / 'single-leg-source.png')
    data = np.array(source)
    regions, _ = label(data[:, :, 3] >= 128, np.ones((3, 3)))
    ids = np.argsort(np.bincount(regions.ravel())[1:])[-4:] + 1
    ids = sorted(ids, key=lambda n: np.where(regions == n)[1].min())
    yy, xx = np.indices(regions.shape)
    frames = []
    sole_positions = ((154, 282), (146, 290), (138, 298), (146, 280))
    root = np.array((141., 207.))
    width = np.diag((1.35, 1.))
    for n, sole_position in zip(ids, sole_positions):
        y, _ = np.where(regions == n)
        top, bottom = int(y.min()), int(y.max() + 1)
        thigh = (regions == n) & (yy < top + .10 * (bottom - top))
        sole = (regions == n) & (yy >= bottom - .035 * (bottom - top))
        anchor = np.array((np.median(xx[thigh]), np.median(yy[thigh])))
        foot = np.array((np.median(xx[sole]), np.median(yy[sole])))
        part = data.copy(); part[regions != n] = 0
        source_vector = width @ (foot - anchor)
        target_vector = np.array(sole_position) - root
        denominator = float(source_vector @ source_vector)
        a = float(target_vector @ source_vector) / denominator
        b = float(target_vector[1] * source_vector[0] - target_vector[0] * source_vector[1]) / denominator
        inverse = np.linalg.inv(np.array(((a, -b), (b, a))) @ width)
        offset = anchor - inverse @ root
        frames.append(clean(Image.fromarray(part).transform(SIZE, Image.Transform.AFFINE,
            (inverse[0, 0], inverse[0, 1], offset[0], inverse[1, 0], inverse[1, 1], offset[1]),
            Image.Resampling.BICUBIC)))
    return frames


def continuous_upper(direction):
    """Original complete hood/shoulders, with the already accepted cloth RGBs.

    The old builder pasted the first head as a rectangle through y=97 onto
    every shoulder pose. Restore the original continuous upper drawing instead.
    RGB pairs below that splice recover the existing fixed cloth color map.
    """
    poses = old['split_poses'](BASE / f'walk-{direction}-body-source.png', 4, 2)
    scale = 280 / max(p['bottom'] - p['top'] for p in poses)
    bodies = [old['render'](p, scale) for p in poses]
    alternate = old['split_poses'](BASE / 'walk-alternate-step-source.png', 4, 2)[
        ('down-left', 'down-right', 'up-left', 'up-right').index(direction)]
    bodies[2] = old['render'](alternate, 280 / (alternate['bottom'] - alternate['top']))
    accepted = cells(rgba(BASE / f'walk-{direction}-256x320.png'))
    pairs = []
    yy, _ = np.indices((320, 256))
    for body, final in zip(bodies, accepted):
        mask = old['cloth_mask'](body) & old['cloth_mask'](final) & (yy >= 110) & (yy < 210)
        pairs.append(np.concatenate([np.array(body)[:, :, :3][mask], np.array(final)[:, :, :3][mask]], axis=1))
    pairs, counts = np.unique(np.concatenate(pairs), axis=0, return_counts=True)
    # Most frequent target per source RGB; avoid sampling staff or tiny filled holes.
    order = np.argsort(-counts, kind='stable')
    _, first = np.unique(pairs[order, :3], axis=0, return_index=True)
    pairs = pairs[order[first]]
    tree = cKDTree(pairs[:, :3].astype(float))
    result = []
    for body in bodies:
        data = np.array(body); mask = old['cloth_mask'](body)
        data[:, :, :3][mask] = pairs[tree.query(data[:, :, :3][mask].astype(float))[1], 3:]
        result.append(clean(Image.fromarray(data)))
    return result


def main():
    cycle = single_leg_cycle()
    near = [cycle[i] for i in (2, 3, 0, 1)]
    far = []
    for leg in cycle:
        layer = Image.new('RGBA', SIZE); layer.paste(leg, (-29, -3)); far.append(layer)
    visible = [~garment for _, _, _, garment in v3['body_layers']('up-right', 4)]
    mapped = v3['match_browns'](near + far, visible + visible)
    near, far = mapped[:4], mapped[4:]
    yy, _ = np.indices((320, 256))
    walking = {}
    for direction in DIRECTIONS:
        near_legs, far_legs = near, far
        if direction.endswith('left'):
            def mirrored(legs):
                result = []
                for leg in legs:
                    image = Image.new('RGBA', SIZE)
                    image.paste(leg.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (1, 0)); result.append(image)
                return result
            near_legs, far_legs = mirrored(near), mirrored(far)
        legs = []
        for far_leg, near_leg in zip(far_legs, near_legs):
            layer = far_leg.copy(); layer.alpha_composite(near_leg); legs.append(layer)
        uppers = continuous_upper(direction)
        frames, masks, garment_masks, upper_masks = [], [], [], []
        for leg, upper, (original, staff, keep, garment_alpha) in zip(
                legs, uppers, v3['body_layers'](direction, 4)):
            pixels = np.array(leg)
            shadow = binary_dilation(garment_alpha, iterations=2) & ~garment_alpha
            shadow &= (pixels[:, :, 3] > 0) & (yy >= 195)
            pixels[shadow, :3] = np.rint(pixels[shadow, :3] * .78).astype('uint8')
            new_leg = Image.fromarray(pixels)
            if direction.endswith('left'):
                frame = new_leg.copy(); keep |= np.array(staff)[:, :, 3] > 0
            else:
                frame = staff.copy(); frame.alpha_composite(new_leg)
            # Preserve transparent contour pixels too: a bent upper thigh
            # must not poke through the outside of the accepted cloak edge.
            assembled = np.array(frame); original_pixels = np.array(original)
            assembled[keep] = original_pixels[keep]
            frame = Image.fromarray(assembled)
            # Complete original upper drawing: no rectangular first-head copy.
            complete = staff.copy()
            if direction.endswith('left'):
                complete = upper.copy(); complete.alpha_composite(staff)
            else: complete.alpha_composite(upper)
            frame.paste(complete.crop((0, 0, 256, 140)), (0, 0))
            keep[:140] = False
            frame, keep = v3['v2']['cleanup'](frame, keep)
            frames.append(frame)
            for target, selection in ((masks, keep), (garment_masks, garment_alpha),
                                      (upper_masks, yy < 140)):
                mask = np.zeros((320, 256, 4), dtype=np.uint8); mask[selection] = 255
                target.append(Image.fromarray(mask))
        for name, images in (('walk', frames), ('legs', legs), ('protected', masks),
                              ('garment', garment_masks), ('upper-region', upper_masks),
                              ('near-leg', near_legs), ('far-leg', far_legs)):
            strip(images).save(OUT / f'{name}-{direction}-256x320.png', optimize=True)
        preview(strip(frames)).save(OUT / f'walk-{direction}-frames-preview.png', optimize=True)
        walking[direction] = frames
    palette = preview(strip([f for frames in walking.values() for f in frames])).quantize(
        colors=256, dither=Image.Dither.NONE)
    for direction, frames in walking.items():
        gifs = [preview(frame).quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
        gifs[0].save(OUT / f'walk-{direction}-preview.gif', save_all=True, append_images=gifs[1:],
                     duration=240, loop=0, disposal=2, optimize=False)
    (OUT / 'art.json').write_text(json.dumps({
        'integrated': True, 'directions': DIRECTIONS, 'frameWidth': 256, 'frameHeight': 320,
        'frameCount': 4, 'frameDurationMs': 240, 'cycleDurationMs': 960,
        'phases': ['far-left contact, near-right trails', 'near-right passing, far-left supports',
                   'near-right contact, far-left trails', 'far-left passing, near-right supports'],
        'shoulders': 'continuous original upper drawings, no first-head rectangle at y=97',
        'legConstruction': 'four drawn whole-leg poses, opposite phases at distinct hip anchors',
        'registration': 'thigh/sole registration of actual three-quarter drawings; shared width scale 1.35',
        'nearLegPhases': [2, 3, 0, 1], 'farLegPhases': [0, 1, 2, 3],
        'nearSoleTargets': [[138, 298], [146, 280], [154, 282], [146, 290]],
        'farSoleTargets': [[125, 279], [117, 287], [109, 295], [117, 277]],
        'brownReference': 'druid-front-refinement-v2/idle-down-256x320.png',
        'preserved': 'lower cloak contour, hands/staff, all other directions and idles',
        'frontalLegShear': False}, indent=2) + '\n')
    print('Rear diagonals: alternating forward/back contact, continuous original shoulders.')


if __name__ == '__main__': main()
