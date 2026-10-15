"""Slice separate front-view art; never writes runtime art or imports.

Both source drawings were edited with the image tool. Mechanical preparation
only extracts, aligns and resizes the complete poses and encodes PNG/GIF.
Python 3, Pillow, NumPy and SciPy; not needed to run the game.
"""
import json
import importlib.util
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_fill_holes, distance_transform_edt, label

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-front-refinement-v1'
SIZE = (64, 80)
BACKGROUND = (38, 54, 40, 255)
DURATION = 240


def save(image, name):
    pixels = np.array(image)
    pixels[pixels[:, :, 3] == 0] = 0
    Image.fromarray(pixels).save(OUT / name)


def figures(name, count):
    source = np.array(Image.open(OUT / name).convert('RGBA'))
    components, _ = label(source[:, :, 3] >= 128, np.ones((3, 3)))
    counts = np.bincount(components.ravel())
    indices = np.argsort(counts[1:])[-count:] + 1
    indices = sorted(indices, key=lambda index: (
        int(np.where(components == index)[0].min() > source.shape[0] / 2),
        np.where(components == index)[1].min()))
    poses = []
    for index in indices:
        yy, xx = np.where(components == index)
        left, top, right, ground = int(xx.min()), int(yy.min()), int(xx.max() + 1), int(yy.max() + 1)
        pixels = source.copy()
        pixels[:, :, 3] = np.where(components == index, 255, 0)
        foot_mask = pixels[:, :, 3].copy()
        foot_mask[:round(ground - (ground - top) * .1)] = 0
        foot_mask[:, round(left + (right - left) * .72):] = 0
        _, feet_x = np.where(foot_mask)
        poses.append((Image.fromarray(pixels), (feet_x.min() + feet_x.max() + 1) / 2, ground, top))
    return poses


def normalize(poses):
    # Shared walk scale retains the original full-body bob and gait.
    scale = 70 / max(ground - top for _, _, ground, top in poses)
    result = []
    for image, centre, ground, _ in poses:
        frame = image.transform(SIZE, Image.Transform.AFFINE,
            (1 / scale, 0, centre - 32 / scale, 0, 1 / scale, ground - 75 / scale),
            Image.Resampling.BICUBIC)
        pixels = np.array(frame)
        pixels[:, :, 3] = np.where(pixels[:, :, 3] >= 128, 255, 0)
        result.append(Image.fromarray(pixels))
    return result, scale


def enlarged(image, scale=4):
    background = Image.new('RGBA', image.size, BACKGROUND)
    background.alpha_composite(image)
    return background.convert('RGB').resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)


def main():
    idle_frames, idle_scale = normalize(figures('front-source.png', 1))
    frames, walk_scale = normalize(figures('walk-down-source.png', 4))
    # Match all five poses together: identical source cloth colors get identical
    # approved Basic colors, rather than a separate palette on each walk frame.
    spec = importlib.util.spec_from_file_location('basic_walk', ROOT / 'scripts/prepare-basic-druid-walk.py')
    basic_walk = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(basic_walk)
    all_poses = Image.new('RGBA', (320, 80))
    for index, frame in enumerate([idle_frames[0], *frames]):
        all_poses.paste(frame, (index * 64, 0))
    all_poses = basic_walk.match_cloth(all_poses, 'down')
    prepared = []
    repairs = []
    for index in range(5):
        data = np.array(all_poses.crop((index * 64, 0, (index + 1) * 64, 80)))
        alpha = data[:, :, 3] > 0
        yy, xx = np.indices(alpha.shape)
        # Only enclosed gaps in lower side cloth. Keep the natural leg opening
        # and the small space around the thumb/grip transparent.
        holes = binary_fill_holes(alpha) & ~alpha & (yy >= 40) & ((xx < 23) | (xx > 40))
        nearest = distance_transform_edt(~alpha, return_distances=False, return_indices=True)
        data[holes] = data[nearest[0][holes], nearest[1][holes]]
        repairs.append(int(holes.sum()))
        prepared.append(Image.fromarray(data))
    idle, *frames = prepared
    strip = Image.new('RGBA', (256, 80))
    for index, frame in enumerate(frames):
        strip.paste(frame, (index * 64, 0))
    save(idle, 'idle-down-64x80.png')
    save(strip, 'walk-down-64x80.png')
    enlarged(idle).save(OUT / 'idle-down-preview.png')
    enlarged(strip).save(OUT / 'walk-down-frames-preview.png')
    palette = enlarged(strip, 1).quantize(colors=256, dither=Image.Dither.NONE)
    previews = [enlarged(frame).quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    previews[0].save(OUT / 'walk-down-preview.gif', save_all=True, append_images=previews[1:],
                     duration=DURATION, loop=0, disposal=2, optimize=False)
    for image in [idle, *frames]:
        alpha = np.array(image)[:, :, 3]
        assert set(np.unique(alpha)) == {0, 255}
        assert not alpha[75:].any()
    metadata = {'integrated': False, 'frameWidth': 64, 'frameHeight': 80,
        'frameCount': 4, 'frameDurationMs': DURATION, 'previewScale': 4,
        'reference': '../druid-sprites-v1/druid-04-basic.png',
        'idleSource': 'front-source.png', 'walkSource': 'walk-down-source.png',
        'idle': 'idle-down-64x80.png', 'walk': 'walk-down-64x80.png', 'baselineY': 75,
        'preparation': {'idleScale': idle_scale, 'sharedWalkScale': walk_scale,
                        'wholeDrawnPoses': True, 'resampling': 'BICUBIC', 'alphaThreshold': 128,
                        'clothPalette': '../druid-sprites-v1/druid-04-basic.png',
                        'enclosedLowerClothPixelsRepaired': repairs}}
    (OUT / 'art.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print('Separate proposal: idle PNG, 4-frame down walk, 64x80, 240 ms, no runtime changes.')


if __name__ == '__main__':
    main()
