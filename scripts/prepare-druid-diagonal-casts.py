"""Change only the rigid staff sweep in two accepted diagonal casts.

Reassemble the existing body/palm layers, then verify they reproduce the old
PNGs before rotating the branch. Previous assets are read-only rollback options.
"""
import json
from pathlib import Path
import runpy

import numpy as np
from PIL import Image
from scipy.ndimage import label

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-cast-diagonal-v2'
right = runpy.run_path(str(ROOT / 'scripts/prepare-druid-right-casts.py'))
base = right['base']; old = base['old']
rgba, clean = base['rgba'], base['clean']
SIZE, OFFSET = base['SIZE'], base['OFFSET']
DIRECTIONS = ('down-right', 'up-left')
# Reverse the old sweeps and keep the main gesture within 45 degrees.
ANGLES = {'down-right': (-8, -25, 35, 45, 25, 0),
          'up-left': (8, 25, -35, -45, -25, 0)}


def fit_angle(staff, grip, angle):
    ys, xs = np.where(np.array(staff)[:, :, 3] > 0)
    wood = np.stack((xs - 196., ys - 135.))
    for _ in range(45):
        theta = np.deg2rad(angle); c, s = np.cos(theta), np.sin(theta)
        projected = np.array(((c, s), (-s, c))) @ wood + (grip + OFFSET)[:, None]
        if projected[1].min() > 3 and projected[1].max() < SIZE[1] - 3:
            return angle
        angle += 2 * (1 if angle >= 0 else -1)
    raise ValueError('Raised branch cannot fit without clipping')


def compose(body, palm_mask, staff, grip, angle, behind):
    body_layer = Image.new('RGBA', SIZE); body_layer.paste(body, OFFSET)
    branch = old['position_staff'](staff, grip, angle)
    frame = Image.new('RGBA', SIZE)
    for layer in ((branch, body_layer) if behind else (body_layer, branch)):
        frame.alpha_composite(layer)
    pixels = np.array(body); pixels[~palm_mask] = 0
    palm = Image.new('RGBA', SIZE); palm.paste(Image.fromarray(pixels), OFFSET)
    frame.alpha_composite(palm)
    return clean(frame)


def main():
    OUT.mkdir(exist_ok=True)
    staff = rgba(ROOT / 'docs/art/druid-cast-down-v1/staff-master-256x320.png')
    manifest = json.loads((base['OUT'] / 'art.json').read_text())
    metadata = {'integrated': True, 'frameWidth': 512, 'frameHeight': 384,
                'idleOffset': OFFSET, 'durationMs': 670, 'directions': {},
                'bodyAndPalm': 'exact accepted layers; only staff rotation changes',
                'previousAssets': 'retained untouched in their original folders'}
    for direction in DIRECTIONS:
        previous_folder = right['OUT'] if direction == 'down-right' else base['OUT']
        previous = rgba(previous_folder / f'cast-{direction}-512x384.png')
        originals = [previous.crop((i * SIZE[0], 0, (i + 1) * SIZE[0], SIZE[1])) for i in range(8)]
        idle = rgba(ROOT / f'docs/art/druid-eight-way-v1/idle-{direction}-256x320.png')
        bodies = base['body_frames'](direction, idle)
        edits = right['edited_bodies'](direction, idle) if direction == 'down-right' else None
        frames, grips, angles = [originals[0].copy()], [], []
        for phase, body in enumerate(bodies):
            grip, palm_mask = base['hand_for'](body, base['HINTS'][direction][phase])
            patched = direction == 'down-right' and phase in (2, 3)
            if patched:
                new_grip, _ = base['hand_for'](edits[phase], (223, 108))
                body, _ = right['arm_patch'](body, edits[phase], right['ROOTS'][direction],
                    manifest['directions'][direction]['gripCenters'][phase], new_grip, direction)
                grip, palm_mask = base['hand_for'](body, new_grip)
            behind = direction == 'up-left'
            if behind:
                body, interior = base['rear_cloak'](body, idle)
                palm_mask &= ~interior
            previous_angle = old['ANGLES'][phase] * base['SIGNS'][direction]
            if not patched: previous_angle = fit_angle(staff, grip, previous_angle)
            accepted = compose(body, palm_mask, staff, grip, previous_angle, behind)
            assert np.array_equal(np.array(accepted), np.array(originals[phase + 1])), \
                (direction, phase, 'Body/palm reconstruction differs from accepted frame')
            angle = fit_angle(staff, grip, ANGLES[direction][phase])
            assert abs(angle) <= 45, (direction, phase, 'Excessive rotation')
            frame = compose(body, palm_mask, staff, grip, angle, behind)
            data = np.array(frame)
            assert set(np.unique(data[:, :, 3])) <= {0, 255}
            assert label(data[:, :, 3] > 0, np.ones((3, 3)))[1] == 1, (direction, phase, 'Detached pixels')
            x0, y0, x1, y1 = frame.getbbox()
            assert x0 > 0 and y0 > 0 and x1 < SIZE[0] and y1 < SIZE[1], (direction, phase, 'Clipped frame')
            frames.append(frame); grips.append(grip.tolist()); angles.append(angle)
        frames.append(originals[-1].copy())
        old['strip'](frames).save(OUT / f'cast-{direction}-512x384.png', optimize=True)
        contact = Image.new('RGBA', (SIZE[0] * 4, SIZE[1] * 2))
        for i, frame in enumerate(frames): contact.paste(frame, (i % 4 * SIZE[0], i // 4 * SIZE[1]))
        old['preview'](contact).save(OUT / f'cast-{direction}-keyframes.png', optimize=True)
        palette = old['preview'](contact).quantize(colors=256, dither=Image.Dither.NONE)
        gifs = [old['preview'](f).quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
        gifs[0].save(OUT / f'cast-{direction}-preview.gif', save_all=True, append_images=gifs[1:],
                     duration=list(old['DURATIONS']), loop=0, disposal=2, optimize=False)
        metadata['directions'][direction] = {'previousFolder': previous_folder.name,
            'staffAnglesDegrees': angles, 'gripCenters': grips,
            'preservedFrames': [0, 7], 'staffHand': 'anatomical-left'}
        print(direction, 'staff angles', angles, 'accepted body/palm layers verified')
    (OUT / 'art.json').write_text(json.dumps(metadata, indent=2) + '\n')


if __name__ == '__main__': main()
