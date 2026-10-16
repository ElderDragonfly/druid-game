"""Six authored body phases per direction + one original, rigid branch.

The approved down-v1 images are read verbatim. Other views get their own
drawings, never mirrored bodies (the anatomical left hand must stay left).
"""
import json
from pathlib import Path
import runpy

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_dilation, binary_fill_holes, label

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-cast-eight-way-v1'
old = runpy.run_path(str(ROOT / 'scripts/prepare-druid-cast-down.py'))
art = old['old']
clean, rgba = old['clean'], old['rgba']
SIZE, OFFSET = old['SIZE'], old['OFFSET']
DIRECTIONS = ('down', 'left', 'right', 'up', 'down-left', 'down-right', 'up-left', 'up-right')
SIGNS = {'down': 1, 'left': 1, 'right': -1, 'up': -1,
         'down-left': 1, 'down-right': -1, 'up-left': 1, 'up-right': -1}
HINTS = {
    'up': ((60, 125), (70, 65), (140, 110), (125, 125), (60, 125), (65, 140)),
    'left': ((65, 120), (80, 85), (100, 110), (80, 110), (65, 120), (95, 115)),
    'right': ((195, 120), (195, 65), (160, 110), (145, 120), (205, 120), (210, 140)),
    'down-left': ((200, 135), (200, 75), (170, 115), (145, 125), (205, 120), (200, 140)),
    'down-right': ((195, 135), (200, 75), (170, 115), (145, 125), (205, 120), (200, 140)),
    'up-left': ((70, 130), (80, 70), (120, 110), (110, 125), (70, 125), (75, 140)),
    'up-right': ((190, 130), (200, 70), (165, 110), (150, 125), (200, 125), (200, 140)),
}


def hood_anchor(image):
    data = np.array(image); mask = art['cloth_mask'](image)
    yy, xx = np.indices(mask.shape)
    top = np.where(data[:, :, 3] > 0)[0].min()
    hood = mask & (yy < top + 54) & (xx > 70) & (xx < 185)
    return float(np.median(xx[hood]))


def body_frames(direction, idle):
    poses = art['split_poses'](OUT / f'body-{direction}-source.png', 6, 3)
    scale = 280 / max(p['bottom'] - p['top'] for p in poses)
    anchor = hood_anchor(idle)
    frames = [clean(p['image'].transform((256, 320), Image.Transform.AFFINE,
        (1 / scale, 0, p['anchor'] - anchor / scale,
         0, 1 / scale, p['bottom'] - 300 / scale), Image.Resampling.BICUBIC)) for p in poses]
    frames = art['palette_match'](frames)
    # A generated rear recovery drawing incorrectly switched to the other
    # hand. Reuse the correctly drawn left-hand opening pose for recovery.
    if direction == 'up': frames[4] = frames[0].copy()
    yy, _ = np.indices((320, 256))
    masks, legs = [], []
    for frame in frames:
        hsv = np.array(frame.convert('RGB').convert('HSV'))
        mask = old['v3']['brown_mask'](frame) & (yy >= 215) & (hsv[:, :, 0] <= 21)
        pixels = np.array(frame); pixels[~mask] = 0
        masks.append(mask); legs.append(Image.fromarray(pixels))
    legs = old['v3']['match_browns'](legs, [np.ones((320, 256), dtype=bool)] * 6)
    for i, mask in enumerate(masks):
        pixels = np.array(frames[i]); pixels[mask] = np.array(legs[i])[mask]
        frames[i] = clean(Image.fromarray(pixels))
    return frames


def hand_for(frame, hint):
    data = np.array(frame); hsv = np.array(frame.convert('RGB').convert('HSV'))
    yy, xx = np.indices((320, 256))
    skin = (data[:, :, 3] > 0) & (hsv[:, :, 0] <= 27) & (hsv[:, :, 1] >= 65) & (hsv[:, :, 2] >= 140)
    skin &= (yy >= 35) & (yy < 165)
    regions, count = label(binary_dilation(skin, iterations=1), np.ones((3, 3)))
    candidates = []
    for n in range(1, count + 1):
        part = (regions == n) & skin
        if part.sum() < 200: continue
        center = np.array((np.median(xx[part]), np.median(yy[part])))
        distance = float(np.linalg.norm(center - hint))
        candidates.append((distance, center, part))
    assert candidates, f'No gripping hand near {hint}'
    _, center, part = min(candidates, key=lambda c: c[0])
    assert np.linalg.norm(center - hint) < 66, (hint, center)
    mask = binary_dilation(binary_fill_holes(part), iterations=2) & (data[:, :, 3] > 0)
    return center, mask


def rear_cloak(frame, idle):
    """The arm sweeps in FRONT of the chest, not across the back of the cape."""
    source = np.array(idle); data = np.array(frame)

    def silhouette(image):
        color = art['cloth_mask'](image)
        regions, _ = label(color, np.ones((3, 3)))
        largest = np.argmax(np.bincount(regions.ravel())[1:]) + 1
        core = binary_fill_holes(regions == largest)
        hsv = np.array(image.convert('RGB').convert('HSV'))
        # Include dark outline/fold pixels, not the old white cuff outside it.
        edge = binary_dilation(core, iterations=1) & ((hsv[:, :, 1] > 60) | (hsv[:, :, 2] < 80))
        return (core | edge) & (np.array(image)[:, :, 3] > 0)

    interior = silhouette(idle)
    # Replace the entire continuous cloak, from hood to hem. A rectangular
    # repair patch produces a visible horizontal seam in the folds.
    data[interior] = source[interior]
    return Image.fromarray(data), interior


def assemble(direction):
    idle = rgba(ROOT / f'docs/art/druid-eight-way-v1/idle-{direction}-256x320.png')
    if direction == 'down':
        return [rgba(ROOT / f'docs/art/druid-cast-down-v1/cast-down-{i:02d}.png') for i in range(8)], []
    bodies = body_frames(direction, idle)
    staff = rgba(ROOT / 'docs/art/druid-cast-down-v1/staff-master-256x320.png')
    first = Image.new('RGBA', SIZE); first.paste(idle, OFFSET)
    frames, points = [first], []
    for i, (body, angle, hint) in enumerate(zip(bodies, old['ANGLES'], HINTS[direction])):
        grip, mask = hand_for(body, hint)
        if direction in ('up', 'up-left', 'up-right', 'right'):
            body, interior = rear_cloak(body, idle)
            mask &= ~interior
        body_layer = Image.new('RGBA', SIZE); body_layer.paste(body, OFFSET)
        actual_angle = angle * SIGNS[direction]
        # The raised fist is a little higher in some side/rear drawings.
        # Tilt the same branch enough to fit; never clip its fork or shrink it.
        ys, xs = np.where(np.array(staff)[:, :, 3] > 0)
        wood = np.stack((xs - 196., ys - 135.))
        for _ in range(45):
            theta = np.deg2rad(actual_angle); c, s = np.cos(theta), np.sin(theta)
            projected = np.array(((c, s), (-s, c))) @ wood + (grip + OFFSET)[:, None]
            if projected[1].min() > 3 and projected[1].max() < SIZE[1] - 3: break
            actual_angle += 2 * (1 if actual_angle >= 0 else -1)
        else: raise ValueError(f'Staff cannot fit: {direction}, {i}')
        branch = old['position_staff'](staff, grip, actual_angle)
        frame = Image.new('RGBA', SIZE)
        # The left arm is on the far side in these views, so the torso/cape
        # naturally occludes the branch. No mirrored hand swaps.
        if direction in ('up', 'right', 'up-right', 'up-left'):
            frame.alpha_composite(branch); frame.alpha_composite(body_layer)
        else:
            frame.alpha_composite(body_layer); frame.alpha_composite(branch)
        pixels = np.array(body); pixels[~mask] = 0
        palm = Image.new('RGBA', SIZE); palm.paste(Image.fromarray(pixels), OFFSET)
        frame.alpha_composite(palm)
        frame = clean(frame)
        frames.append(frame); points.append(grip.tolist())
    frames.append(first.copy())
    old['strip'](frames).save(OUT / f'cast-{direction}-512x384.png', optimize=True)
    return frames, points


def main():
    OUT.mkdir(exist_ok=True)
    metadata = {'integrated': True, 'reference': '../druid-cast-down-v1/cast-down-preview.gif',
        'downPixels': 'original v1 unchanged; runtime imports its original PNG directly',
        'frameWidth': 512, 'frameHeight': 384, 'idleOffset': OFFSET, 'feetY': 340,
        'frameCount': 8, 'activeFrames': [1, 2, 3, 4, 5, 6],
        'gameDurationsMs': list(old['DURATIONS'][1:-1]), 'gameDurationMs': 670, 'directions': {}}
    all_frames = []
    for direction in DIRECTIONS:
        frames, points = assemble(direction)
        contact = Image.new('RGBA', (SIZE[0] * 4, SIZE[1] * 2))
        for i, frame in enumerate(frames):
            contact.paste(frame, (i % 4 * SIZE[0], i // 4 * SIZE[1]))
        old['preview'](contact).save(OUT / f'cast-{direction}-keyframes.png', optimize=True)
        palette = old['preview'](contact).quantize(colors=256, dither=Image.Dither.NONE)
        gifs = [old['preview'](f).quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
        gifs[0].save(OUT / f'cast-{direction}-preview.gif', save_all=True, append_images=gifs[1:],
            duration=list(old['DURATIONS']), loop=0, disposal=2, optimize=False)
        assert np.array_equal(np.array(frames[0]), np.array(frames[-1]))
        for i, frame in enumerate(frames):
            data = np.array(frame)
            assert set(np.unique(data[:, :, 3])) <= {0, 255}
            if direction != 'down':
                assert label(data[:, :, 3] > 0, np.ones((3, 3)))[1] == 1, (direction, i, 'Detached pixels')
            x0, y0, x1, y1 = frame.getbbox()
            assert x0 > 0 and y0 > 0 and x1 < SIZE[0] and y1 < SIZE[1], (direction, i, frame.getbbox())
        metadata['directions'][direction] = {'gripCenters': points, 'staffHand': 'anatomical-left', 'mirrored': False}
        all_frames.append(frames)
        print(direction, 'grips', points)
    overview = []
    for phase in range(8):
        canvas = Image.new('RGB', (SIZE[0] * 4, (SIZE[1] + 24) * 2), (38, 54, 40))
        draw = ImageDraw.Draw(canvas)
        for i, direction in enumerate(DIRECTIONS):
            x, y = i % 4 * SIZE[0], i // 4 * (SIZE[1] + 24)
            canvas.paste(old['preview'](all_frames[i][phase]), (x, y + 24))
            draw.text((x + 12, y + 7), direction, fill=(230, 230, 200))
        overview.append(canvas)
    overview[0].save(OUT / 'all-directions-preview.gif', save_all=True, append_images=overview[1:],
        duration=list(old['DURATIONS']), loop=0, disposal=2, optimize=False)
    (OUT / 'art.json').write_text(json.dumps(metadata, indent=2) + '\n')


if __name__ == '__main__': main()
