"""Art-only front casting preview: drawn body poses plus one rigid staff.

No game imports or behavior changes. Pillow/NumPy/SciPy crop the six drawings,
register faces/feet, transfer the accepted palette and assemble the layers.
"""
import json
from pathlib import Path
import runpy

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, binary_fill_holes, label

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-cast-down-v1'
REFERENCE = ROOT / 'docs/art/druid-front-refinement-v2/idle-down-256x320.png'
old = runpy.run_path(str(ROOT / 'scripts/prepare-druid-eight-way.py'))
v3 = runpy.run_path(str(ROOT / 'scripts/prepare-druid-diagonal-legs-v3.py'))
clean = old['clean']
SIZE = (512, 384)
OFFSET = (128, 40)
BACKGROUND = (38, 54, 40, 255)
ANGLES = (-8, -25, 35, 75, 25, 0)
DURATIONS = (320, 100, 120, 80, 130, 110, 130, 440)
HAND_HINTS = ((192, 118), (185, 100), (167, 112), (143, 135), (171, 133), (193, 136))


def rgba(path): return Image.open(path).convert('RGBA')


def strip(frames):
    result = Image.new('RGBA', (SIZE[0] * len(frames), SIZE[1]))
    for i, frame in enumerate(frames): result.paste(frame, (i * SIZE[0], 0))
    return result


def preview(image):
    result = Image.new('RGBA', image.size, BACKGROUND)
    result.alpha_composite(image)
    return result.convert('RGB')


def body_frames():
    image = rgba(OUT / 'body-source.png'); data = np.array(image)
    regions, _ = label(data[:, :, 3] >= 128, np.ones((3, 3)))
    sizes = np.bincount(regions.ravel())
    ids = np.argsort(sizes[1:])[-6:] + 1
    ids = sorted(ids, key=lambda n: (np.where(regions == n)[0].min() > image.height / 2,
                                    np.where(regions == n)[1].min()))
    hsv = np.array(image.convert('RGB').convert('HSV'))
    yy, xx = np.indices(regions.shape)
    poses = []
    for n in ids:
        ys, xs = np.where(regions == n)
        top, bottom = int(ys.min()), int(ys.max() + 1)
        face = (regions == n) & (yy >= top + .10 * (bottom - top)) & (yy < top + .20 * (bottom - top))
        face &= (xx > xs.min() + .28 * (xs.max() - xs.min())) & (xx < xs.min() + .67 * (xs.max() - xs.min()))
        face &= (hsv[:, :, 0] >= 5) & (hsv[:, :, 0] <= 27) & (hsv[:, :, 1] > 65) & (hsv[:, :, 2] > 135)
        pixels = data.copy(); pixels[regions != n] = 0
        poses.append((Image.fromarray(pixels), top, bottom, float(np.median(xx[face]))))
    scale = 280 / max(bottom - top for _, top, bottom, _ in poses)
    frames = [clean(image.transform((256, 320), Image.Transform.AFFINE,
        (1 / scale, 0, face - 125 / scale, 0, 1 / scale, bottom - 300 / scale),
        Image.Resampling.BICUBIC)) for image, _, bottom, face in poses]
    frames = old['palette_match'](frames)
    # Only brown trousers/boots; leave tan tunic, rope, skin and hair alone.
    yy, _ = np.indices((320, 256))
    masks, legs = [], []
    for frame in frames:
        data = np.array(frame); hsv = np.array(frame.convert('RGB').convert('HSV'))
        mask = v3['brown_mask'](frame) & (yy >= 215) & (hsv[:, :, 0] <= 21)
        pixels = data.copy(); pixels[~mask] = 0
        masks.append(mask); legs.append(Image.fromarray(pixels))
    mapped = v3['match_browns'](legs, [np.ones((320, 256), dtype=bool)] * 6)
    result = []
    for frame, leg, mask in zip(frames, mapped, masks):
        data = np.array(frame); data[mask] = np.array(leg)[mask]
        result.append(clean(Image.fromarray(data)))
    return result


def staff_master():
    source = rgba(REFERENCE); data = np.array(source)
    hsv = np.array(source.convert('RGB').convert('HSV')); yy, xx = np.indices((320, 256))
    # Above the gripping hand, the branch is an isolated original component.
    upper = (data[:, :, 3] >= 128) & (xx >= 185) & (xx <= 230) & (yy <= 122)
    upper &= (yy < 95) | (xx >= 191)
    regions, _ = label(upper, np.ones((3, 3)))
    selected = regions == regions[30, 207]
    # Below the hand, keep the full row contour between wood edges, including
    # olive grain INSIDE the shaft. Do not erase interior greenish wood pixels.
    rows = (150, 155, 165, 175, 185, 195, 205, 215, 225, 235, 245, 255, 264)
    centers = (194, 194, 193, 191, 191, 189, 188, 188, 186, 185, 183, 182, 183)
    for y in range(150, 265):
        center = np.interp(y, rows, centers)
        core = (data[y, :, 3] > 0) & (abs(np.arange(256) - center) <= 7)
        core &= (hsv[y, :, 0] >= 6) & (hsv[y, :, 0] <= 34)
        core &= (hsv[y, :, 2] >= 35) & (hsv[y, :, 2] <= 145)
        positions = np.where(core)[0]
        if len(positions): selected[y, positions.min() - 1:positions.max() + 2] = True
    data[~selected] = 0
    master = Image.fromarray(data)
    # The original hand hides this tiny shaft segment. Reuse nearby wood
    # pixels to bridge it; the new gripping hand will cover the bridge again.
    tile = source.crop((191, 150, 198, 159))
    for x, y in ((193, 123), (192, 132), (191, 141)): master.alpha_composite(tile, (x, y))
    master = clean(master)
    pixels = np.array(master); regions, _ = label(pixels[:, :, 3] > 0, np.ones((3, 3)))
    main = np.argmax(np.bincount(regions.ravel())[1:]) + 1
    pixels[regions != main] = 0
    master = Image.fromarray(pixels); master.save(OUT / 'staff-master-256x320.png', optimize=True)
    assert label(np.array(master)[:, :, 3] > 0, np.ones((3, 3)))[1] == 1, 'Disconnected staff cutout'
    return master


def gripping_hand(frame, hint):
    data = np.array(frame); hsv = np.array(frame.convert('RGB').convert('HSV'))
    yy, xx = np.indices((320, 256))
    skin = (data[:, :, 3] > 0) & (hsv[:, :, 0] <= 27) & (hsv[:, :, 1] >= 65) & (hsv[:, :, 2] >= 140)
    skin &= (yy >= 45) & (yy <= 169) & (xx >= 95)
    skin &= (yy >= 90) | (xx >= 165)  # exclude the face, allow the raised fist
    regions, count = label(binary_dilation(skin, iterations=1), np.ones((3, 3)))
    candidates = []
    for n in range(1, count + 1):
        part = (regions == n) & skin
        if part.sum() < 200: continue  # fists, not small bright cuff/tunic fragments
        center = np.array((np.median(xx[part]), np.median(yy[part])))
        candidates.append((float(np.linalg.norm(center - hint)), center, part))
    _, center, part = min(candidates, key=lambda item: item[0])
    mask = binary_dilation(binary_fill_holes(part), iterations=2) & (data[:, :, 3] > 0)
    return center, mask


def position_staff(master, hand, angle):
    theta = np.deg2rad(angle); c, s = np.cos(theta), np.sin(theta)
    inverse = np.array(((c, -s), (s, c)))
    target = hand + OFFSET; offset = np.array((196., 135.)) - inverse @ target
    return clean(master.transform(SIZE, Image.Transform.AFFINE,
        (c, -s, offset[0], s, c, offset[1]), Image.Resampling.BICUBIC))


def main():
    bodies = body_frames(); staff = staff_master()
    idle = Image.new('RGBA', SIZE); idle.paste(rgba(REFERENCE), OFFSET)
    frames = [idle]; body_layers, staff_layers, hands = [], [], []
    for body, angle, hint in zip(bodies, ANGLES, HAND_HINTS):
        hand, mask = gripping_hand(body, hint)
        body_layer = Image.new('RGBA', SIZE); body_layer.paste(body, OFFSET)
        staff_layer = position_staff(staff, hand, angle)
        frame = body_layer.copy(); frame.alpha_composite(staff_layer)
        overlay = np.array(body); overlay[~mask] = 0
        hand_layer = Image.new('RGBA', SIZE); hand_layer.paste(Image.fromarray(overlay), OFFSET)
        frame.alpha_composite(hand_layer)
        frame = clean(frame)
        frames.append(frame); body_layers.append(body_layer); staff_layers.append(staff_layer)
        hands.append([float(v) for v in hand])
    frames.append(idle.copy())
    for i, frame in enumerate(frames): frame.save(OUT / f'cast-down-{i:02d}.png', optimize=True)
    strip(frames).save(OUT / 'cast-down-512x384.png', optimize=True)
    strip(body_layers).save(OUT / 'body-poses-512x384.png', optimize=True)
    strip(staff_layers).save(OUT / 'staff-poses-512x384.png', optimize=True)
    contact = Image.new('RGBA', (SIZE[0] * 4, SIZE[1] * 2))
    for i, frame in enumerate(frames): contact.paste(frame, ((i % 4) * SIZE[0], (i // 4) * SIZE[1]))
    preview(contact).save(OUT / 'cast-down-frames-preview.png', optimize=True)
    palette = preview(contact).quantize(colors=256, dither=Image.Dither.NONE)
    gifs = [preview(frame).quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    gifs[0].save(OUT / 'cast-down-preview.gif', save_all=True, append_images=gifs[1:],
        duration=list(DURATIONS), loop=0, disposal=2, optimize=False)
    metadata = {'integrated': False, 'direction': 'down', 'action': 'spellcasting sweep',
        'staffHand': 'anatomical-left only', 'frameWidth': SIZE[0], 'frameHeight': SIZE[1],
        'frameCount': len(frames), 'frameDurationsMs': DURATIONS, 'loopDurationMs': sum(DURATIONS),
        'gestureDurationMs': sum(DURATIONS[1:-1]), 'staffAnglesDeg': ANGLES, 'gripCenters': hands,
        'originalIdle': str(REFERENCE.relative_to(ROOT)), 'idleOffset': OFFSET,
        'nativeFigureHeight': 280, 'feetY': 340, 'nativeDetail': '256x320 figure with padding, not enlarged',
        'staffSource': 'one cutout of approved idle; hidden grip bridged with adjacent original wood',
        'layers': 'drawn body, rigid staff, foreground gripping hand',
        'phases': ['idle', 'lift', 'raise', 'sweep', 'follow-through', 'return', 'settle', 'idle']}
    (OUT / 'art.json').write_text(json.dumps(metadata, indent=2) + '\n')
    # Check files and registration without changing or running game behavior.
    assert np.array_equal(np.array(frames[0]), np.array(frames[-1]))
    assert np.array_equal(np.array(frames[0])[40:360, 128:384], np.array(rgba(REFERENCE)))
    assert len({frame.tobytes() for frame in frames}) == 7
    for frame in frames:
        assert set(np.unique(np.array(frame)[:, :, 3])) <= {0, 255}
        x0, y0, x1, y1 = frame.getbbox()
        assert x0 > 0 and y0 > 0 and x1 < SIZE[0] and y1 < SIZE[1], 'Clipped staff or body'
    gif = Image.open(OUT / 'cast-down-preview.gif')
    actual_duration = 0
    for i in range(gif.n_frames): gif.seek(i); actual_duration += gif.info['duration']
    assert gif.n_frames == 8 and actual_duration == sum(DURATIONS)
    print(f'Art only: 8 frames, gesture {sum(DURATIONS[1:-1])} ms, loop {actual_duration} ms, one left-hand staff.')
    print('Grip centers:', hands)


if __name__ == '__main__': main()
