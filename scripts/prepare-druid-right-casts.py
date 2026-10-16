"""Repair only the two inward-folding arm phases in three accepted casts.

Other directions and six of eight PNG frames per repaired direction remain
byte-identical. New drawings supply only a local arm/hidden-cloth patch.
"""
import json
from io import BytesIO
from pathlib import Path
import runpy

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_propagation, label

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-cast-right-v2'
base = runpy.run_path(str(ROOT / 'scripts/prepare-druid-cast-eight-way.py'))
old = base['old']; art = base['art']
rgba, clean = base['rgba'], base['clean']
SIZE, OFFSET = base['SIZE'], base['OFFSET']
DIRECTIONS = ('right', 'down-right', 'up-right')
ROOTS = {'right': (179, 111), 'down-right': (180, 112), 'up-right': (164, 109)}


def edited_bodies(direction, idle):
    source = rgba(OUT / f'body-{direction}-edit-source.png')
    data = np.array(source)
    seeds = np.zeros(data.shape[:2], dtype=bool)
    seeds[[0, -1], :] = True; seeds[:, [0, -1]] = True
    # The new export has a translucent brown glow outside the arm. Flood only
    # exterior low-alpha pixels, preserving every enclosed interior pixel.
    exterior = binary_propagation(seeds & (data[:, :, 3] < 240), mask=data[:, :, 3] < 240)
    data[exterior] = 0
    stream = BytesIO(); Image.fromarray(data).save(stream, format='PNG'); stream.seek(0)
    poses = art['split_poses'](stream, 6, 3)
    scale = 280 / max(p['bottom'] - p['top'] for p in poses)
    anchor = base['hood_anchor'](idle)
    frames = [clean(p['image'].transform((256, 320), Image.Transform.AFFINE,
        (1 / scale, 0, p['anchor'] - anchor / scale,
         0, 1 / scale, p['bottom'] - 300 / scale), Image.Resampling.BICUBIC)) for p in poses]
    return art['palette_match'](frames)


def arm_patch(original, edited, root, old_grip, new_grip, direction):
    # Rounded limb-sized masks remove the old forearm and fill its hidden
    # cloth, avoiding a rectangular seam across the tunic or cape.
    mask = Image.new('1', (256, 320)); draw = ImageDraw.Draw(mask)
    for index, grip in enumerate((old_grip, new_grip)):
        path = [root, tuple(grip)]
        if direction == 'down-right' and index == 0:
            path.insert(1, (174, 126))  # include the old lower white elbow cuff
        draw.line(path, fill=1, width=34)
        for x, y in path:
            draw.ellipse((x - 17, y - 17, x + 17, y + 17), fill=1)
    selected = np.array(mask)
    yy, xx = np.indices((320, 256))
    # Keep the accepted head and the lowered free arm untouched.
    selected &= ~((yy < 94) & (xx < 180))
    if direction == 'up-right': selected &= ~((yy >= 134) & (xx < 180))
    original_data = np.array(original); data = original_data.copy()
    data[selected] = np.array(edited)[selected]
    assert np.array_equal(data[~selected], original_data[~selected])
    return clean(Image.fromarray(data)), selected


def main():
    OUT.mkdir(exist_ok=True)
    manifest = json.loads((base['OUT'] / 'art.json').read_text())
    result = {'integrated': True, 'directions': {}, 'changedFrames': [3, 4],
              'frameWidth': 512, 'frameHeight': 384, 'idleOffset': OFFSET,
              'durationMs': 670, 'staffHand': 'anatomical-left',
              'otherDirections': 'all five original assets are unchanged',
              'movement': 'stationary while casting; held WASD resumes after the gesture'}
    staff = rgba(ROOT / 'docs/art/druid-cast-down-v1/staff-master-256x320.png')
    for direction in DIRECTIONS:
        idle = rgba(ROOT / f'docs/art/druid-eight-way-v1/idle-{direction}-256x320.png')
        source = rgba(base['OUT'] / f'cast-{direction}-512x384.png')
        originals = [source.crop((i * SIZE[0], 0, (i + 1) * SIZE[0], SIZE[1])) for i in range(8)]
        frames = [f.copy() for f in originals]
        bodies = base['body_frames'](direction, idle)
        edits = edited_bodies(direction, idle)
        grips = manifest['directions'][direction]['gripCenters']
        changed_grips = []
        for phase in (2, 3):
            new_grip, _ = base['hand_for'](edits[phase], (223, 108))
            assert new_grip[0] > 195, (direction, phase, 'Hand still inside torso', new_grip)
            body, patch = arm_patch(bodies[phase], edits[phase], ROOTS[direction], grips[phase], new_grip, direction)
            Image.fromarray(patch.astype('uint8') * 255).save(OUT / f'arm-mask-{direction}-{phase}.png', optimize=True)
            grip, hand_mask = base['hand_for'](body, new_grip)
            if direction in ('right', 'up-right'):
                body, interior = base['rear_cloak'](body, idle)
                hand_mask &= ~interior
            body_layer = Image.new('RGBA', SIZE); body_layer.paste(body, OFFSET)
            branch = old['position_staff'](staff, grip, old['ANGLES'][phase] * base['SIGNS'][direction])
            frame = Image.new('RGBA', SIZE)
            for layer in ((branch, body_layer) if direction in ('right', 'up-right') else (body_layer, branch)):
                frame.alpha_composite(layer)
            pixels = np.array(body); pixels[~hand_mask] = 0
            palm = Image.new('RGBA', SIZE); palm.paste(Image.fromarray(pixels), OFFSET)
            frame.alpha_composite(palm)
            frames[phase + 1] = clean(frame)
            changed_grips.append(grip.tolist())
        for i, frame in enumerate(frames):
            data = np.array(frame)
            assert set(np.unique(data[:, :, 3])) <= {0, 255}
            assert label(data[:, :, 3] > 0, np.ones((3, 3)))[1] == 1, (direction, i, 'Detached pixels')
            x0, y0, x1, y1 = frame.getbbox()
            assert x0 > 0 and y0 > 0 and x1 < SIZE[0] and y1 < SIZE[1], (direction, i, frame.getbbox())
            if i not in (3, 4):
                assert np.array_equal(data, np.array(originals[i])), (direction, i, 'Accepted frame changed')
        old['strip'](frames).save(OUT / f'cast-{direction}-512x384.png', optimize=True)
        contact = Image.new('RGBA', (SIZE[0] * 4, SIZE[1] * 2))
        for i, frame in enumerate(frames): contact.paste(frame, (i % 4 * SIZE[0], i // 4 * SIZE[1]))
        old['preview'](contact).save(OUT / f'cast-{direction}-keyframes.png', optimize=True)
        palette = old['preview'](contact).quantize(colors=256, dither=Image.Dither.NONE)
        gifs = [old['preview'](frame).quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
        gifs[0].save(OUT / f'cast-{direction}-preview.gif', save_all=True, append_images=gifs[1:],
                     duration=list(old['DURATIONS']), loop=0, disposal=2, optimize=False)
        result['directions'][direction] = {'newGripCenters': changed_grips,
            'preservedFrames': [0, 1, 2, 5, 6, 7], 'bodyOutsideArmMask': 'byte-identical'}
        print(direction, 'outward grips', changed_grips)
    (OUT / 'art.json').write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__': main()
