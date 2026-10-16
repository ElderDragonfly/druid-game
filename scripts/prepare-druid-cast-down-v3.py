"""Transfer the hand path and staff angle from the user's video to a fixed sprite.

The private video is not an input dependency or a published asset. The sampled
landmarks below refer to its first frontal take (360x640 analysis coordinates).
Only the arm and the original branch move; the body is never rescaled.
"""
import json
from pathlib import Path
import runpy

import numpy as np
from PIL import Image
from scipy.interpolate import PchipInterpolator
from scipy.ndimage import label

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-cast-down-v3'
previous = runpy.run_path(str(ROOT / 'scripts/prepare-druid-cast-down-v2.py'))
clean, rgba = previous['clean'], previous['rgba']
SIZE = previous['SIZE']
OFFSET = previous['OFFSET']
SHOULDER = np.array((160., 104.))
REST_HAND = np.array((195., 135.))
GRIP = np.array((196., 135.))
SOURCE_TIP = np.array((207., 23.))
REST_ANGLE = np.rad2deg(np.arctan2(SOURCE_TIP[0] - GRIP[0], GRIP[1] - SOURCE_TIP[1]))

# Seconds, gripping hand x/y, and shaft inclination from screen vertical.
# Negative inclination puts the upper end to the viewer's left. These are
# observations, not a mathematical semicircle guessed from the verbal prompt.
LANDMARKS = np.array([
    [3.7, 278, 270, -5], [3.8, 266, 268, -14],
    [3.9, 235, 270, -27], [4.0, 186, 278, -36],
    [4.1, 154, 267, -40], [4.2, 150, 266, -40],
    [4.3, 170, 250, -41], [4.4, 194, 229, -36],
    [4.5, 224, 208, -29], [4.6, 266, 213, -16],
    [4.7, 305, 220, -4], [4.8, 334, 229, 0],
    [4.9, 336, 244, 3], [5.0, 326, 260, 0],
    [5.1, 314, 266, -2], [5.2, 304, 270, -3],
    [5.3, 298, 270, -3],
], dtype=float)
# The elbow also moves in the reference; a planar fixed-length IK solution
# swings it the wrong way as the forearm points toward the viewer.
ELBOW_LANDMARKS = np.array([
    [259, 222], [259, 220], [260, 222], [251, 226],
    [242, 229], [240, 228], [239, 220], [245, 202],
    [257, 189], [276, 190], [288, 191], [294, 197],
    [294, 205], [292, 217], [284, 223], [281, 228], [277, 230],
], dtype=float)
REST_ELBOW = np.array((183., 116.))
IDLE_ELBOW = np.array((183., 125.))


def arm_parts():
    """Take only the new sleeve, bracer and fist; discard the generated body."""
    source = rgba(OUT / 'arm-source.png'); data = np.array(source)
    hsv = np.array(source.convert('RGB').convert('HSV'))
    yy, xx = np.indices(data.shape[:2])
    regions, _ = label(data[:, :, 3] >= 128, np.ones((3, 3)))
    foreground = regions == np.argmax(np.bincount(regions.ravel())[1:]) + 1
    cloak = foreground & (hsv[:, :, 0] >= 32) & (hsv[:, :, 0] <= 110)
    cloak &= (hsv[:, :, 1] >= 40) & (xx < source.width * .72)
    top = int(yy[cloak].min()); bottom = int(yy[foreground].max() + 1)
    scale = 277 / (bottom - top)
    face = foreground & (yy > top + .1 * (bottom - top)) & (yy < top + .2 * (bottom - top))
    face &= (hsv[:, :, 0] <= 27) & (hsv[:, :, 1] >= 65) & (hsv[:, :, 2] >= 135)
    face_x = float(np.median(xx[face])); data[~foreground] = 0
    source = clean(Image.fromarray(data).transform((256, 320), Image.Transform.AFFINE,
        (1 / scale, 0, face_x - 123 / scale, 0, 1 / scale, bottom - 298 / scale),
        Image.Resampling.BICUBIC))
    source.save(OUT / 'arm-source-normalized.png', optimize=True)
    data = np.array(source); hsv = np.array(source.convert('RGB').convert('HSV'))
    yy, xx = np.indices((320, 256))
    mask = previous['polygon'](((164, 104), (181, 105), (194, 110), (209, 110),
        (224, 110), (234, 116), (234, 130), (221, 135), (207, 132),
        (191, 130), (178, 126), (166, 118))) & (data[:, :, 3] > 0)
    mask &= ~((hsv[:, :, 0] >= 32) & (hsv[:, :, 0] <= 110) & (hsv[:, :, 1] >= 40))
    start = np.array((160., 104.)); elbow = np.array((190., 120.)); hand = np.array((218., 123.))
    axis = hand - elbow
    along = (xx - elbow[0]) * axis[0] + (yy - elbow[1]) * axis[1]
    cuff = mask & (xx < 196) & (hsv[:, :, 1] < 110) & (hsv[:, :, 2] > 130)
    upper_mask = mask & ((along <= 40) | cuff)
    fore_mask = mask & (along >= -25) & ~cuff
    palm = fore_mask & (xx >= 209) & (hsv[:, :, 0] <= 27)
    palm &= (hsv[:, :, 1] >= 65) & (hsv[:, :, 2] >= 135)
    result = []
    # The fist is a separate rigid layer. Do not leave another stretched fist
    # inside the foreshortened forearm, which would create duplicate fingers.
    fore_mask &= xx <= 214
    for name, part_mask in (('upper-arm', upper_mask), ('forearm', fore_mask), ('hand', palm)):
        pixels = data.copy(); pixels[~part_mask] = 0
        regions, _ = label(pixels[:, :, 3] > 0, np.ones((3, 3)))
        largest = np.argmax(np.bincount(regions.ravel())[1:]) + 1
        pixels[regions != largest] = 0
        part = clean(Image.fromarray(pixels)); part.save(OUT / f'{name}-256x320.png', optimize=True)
        result.append(part)
    return (*result, start, elbow, hand)


def main():
    OUT.mkdir(exist_ok=True)
    old = ROOT / 'docs/art/druid-cast-down-v2'
    original = rgba(previous['REF'])
    body = rgba(old / 'body-fixed-256x320.png')
    staff = rgba(old / 'staff-master-256x320.png')
    upper, fore, hand_image, source_start, source_elbow, source_hand = arm_parts()
    fixed = Image.new('RGBA', SIZE); fixed.paste(body, tuple(OFFSET.astype(int)))
    idle = Image.new('RGBA', SIZE); idle.paste(original, tuple(OFFSET.astype(int)))
    pixels = np.array(original); hsv = np.array(original.convert('RGB').convert('HSV'))
    yy, xx = np.indices((320, 256))
    shoulder_mask = ((xx - 166) ** 2 + (yy - 110) ** 2 <= 15 ** 2) & (yy <= 121)
    shoulder_mask &= (pixels[:, :, 3] > 0) & (hsv[:, :, 0] >= 32) & (hsv[:, :, 0] <= 110)
    pixels[~shoulder_mask] = 0
    cover = Image.new('RGBA', SIZE); cover.paste(Image.fromarray(pixels), tuple(OFFSET.astype(int)))
    frames, durations, poses = [idle], [500], []

    def append(hand, elbow, angle, phase, video_time=None):
        upper_layer = previous['segment'](upper, source_start, source_elbow, SHOULDER, elbow)
        fore_layer = previous['segment'](fore, source_elbow, source_hand, elbow, hand)
        radians = np.deg2rad(angle)
        up = np.array((np.sin(radians), -np.cos(radians)))
        palm_start = hand - np.array((np.cos(radians), np.sin(radians))) * np.linalg.norm(source_hand - source_elbow)
        palm = previous['segment'](hand_image, source_elbow, source_hand, palm_start, hand)
        branch = previous['projected_staff'](staff, hand, up, GRIP)
        frame = fixed.copy()
        for layer in (upper_layer, cover, fore_layer, branch, palm):
            frame.alpha_composite(layer)
        frame = clean(frame)
        # Rotating a binary-alpha edge can isolate one sampled edge pixel.
        # Remove only these detached specks, never pixels within the sprite.
        pixels = np.array(frame)
        regions, _ = label(pixels[:, :, 3] > 0, np.ones((3, 3)))
        counts = np.bincount(regions.ravel()); largest = np.argmax(counts[1:]) + 1
        for component in range(1, len(counts)):
            if component != largest:
                assert counts[component] <= 2, 'A moving part became detached'
                pixels[regions == component] = 0
        frames.append(Image.fromarray(pixels)); durations.append(50)
        poses.append({'phase': phase, 'videoTimeSeconds': video_time,
                      'hand': hand.tolist(), 'elbow': elbow.tolist(),
                      'staffAngleDegrees': float(angle)})

    # Settle into the recorded take, with a short preparation instead of a pop.
    for i in range(1, 7):
        t = previous['ease'](i / 6)
        append(REST_HAND, IDLE_ELBOW * (1 - t) + REST_ELBOW * t,
               REST_ANGLE * (1 - t) + LANDMARKS[0, 3] * t, 'prepare')
    sampled = PchipInterpolator(LANDMARKS[:, 0], LANDMARKS[:, 1:], axis=0)
    sampled_elbow = PchipInterpolator(LANDMARKS[:, 0], ELBOW_LANDMARKS, axis=0)
    for video_time in np.linspace(LANDMARKS[0, 0], LANDMARKS[-1, 0], 46)[1:]:
        raw = sampled(video_time)
        hand = REST_HAND + (raw[:2] - LANDMARKS[0, 1:3]) * .40
        elbow = REST_ELBOW + (sampled_elbow(video_time) - ELBOW_LANDMARKS[0]) * .4
        append(hand, elbow, raw[2], 'video-gesture', float(video_time))
    final_hand = np.array(poses[-1]['hand']); final_elbow = np.array(poses[-1]['elbow'])
    final_angle = poses[-1]['staffAngleDegrees']
    for i in range(1, 9):
        t = previous['ease'](i / 8)
        append(final_hand * (1 - t) + REST_HAND * t, final_elbow * (1 - t) + IDLE_ELBOW * t,
               final_angle * (1 - t) + REST_ANGLE * t, 'return')
    frames.append(idle.copy()); durations.append(650)
    columns = 6; rows = (len(frames) + columns - 1) // columns
    atlas = Image.new('RGBA', (SIZE[0] * columns, SIZE[1] * rows))
    for i, frame in enumerate(frames):
        atlas.paste(frame, ((i % columns) * SIZE[0], (i // columns) * SIZE[1]))
    atlas.save(OUT / 'cast-down-sheet.png', optimize=True)
    keys = (0, 13, 19, 25, 32, 38, 45, len(frames) - 1)
    contact = Image.new('RGBA', (SIZE[0] * 4, SIZE[1] * 2))
    for i, key in enumerate(keys):
        contact.paste(frames[key], ((i % 4) * SIZE[0], (i // 4) * SIZE[1]))
    preview = previous['v1']['preview']
    preview(contact).save(OUT / 'cast-down-keyframes.png', optimize=True)
    palette = preview(atlas).quantize(colors=256, dither=Image.Dither.NONE)
    gifs = [preview(frame).quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    gifs[0].save(OUT / 'cast-down-preview.gif', save_all=True, append_images=gifs[1:],
                 duration=durations, loop=0, disposal=2, optimize=False)
    metadata = {'integrated': False, 'reference': 'user video, first frontal take, 3.7–5.3 s',
                'videoPublished': False, 'referenceLandmarks': LANDMARKS.tolist(),
                'referenceElbowLandmarks': ELBOW_LANDMARKS.tolist(),
                'direction': 'down', 'staffHand': 'anatomical-left',
                'frameWidth': SIZE[0], 'frameHeight': SIZE[1], 'sourceFrameCount': len(frames),
                'atlasColumns': columns, 'atlasRows': rows, 'frameDurationsMs': durations,
                'gestureDurationMs': sum(durations[1:-1]), 'loopDurationMs': sum(durations),
                'body': '../druid-cast-down-v2/body-fixed-256x320.png',
                'staff': '../druid-cast-down-v2/staff-master-256x320.png',
                'armSource': 'arm-source.png; only isolated arm layers used, never the body',
                'staffLengthScale': 1, 'armProjection': 'elbow and hand sampled from video; rigid palm', 'poses': poses}
    (OUT / 'art.json').write_text(json.dumps(metadata, indent=2) + '\n')
    assert np.array_equal(np.array(frames[0]), np.array(frames[-1]))
    hands = np.array([pose['hand'] for pose in poses])
    elbows = np.array([pose['elbow'] for pose in poses])
    assert np.linalg.norm(np.diff(elbows, axis=0), axis=1).max() < 4
    assert np.linalg.norm(np.diff(hands, axis=0), axis=1).max() < 8
    assert np.linalg.norm(hands - elbows, axis=1).min() > 7
    # Each complete sprite must stay connected, binary-alpha, and within frame.
    for n, frame in enumerate(frames):
        alpha = np.array(frame)[:, :, 3]
        assert set(np.unique(alpha)) <= {0, 255}
        _, components = label(alpha > 0, np.ones((3, 3)))
        assert components == 1, (n, components)
        x0, y0, x1, y1 = frame.getbbox()
        assert x0 > 0 and y0 > 0 and x1 < SIZE[0] and y1 < SIZE[1], (n, frame.getbbox())
    gif = Image.open(OUT / 'cast-down-preview.gif'); total = 0
    for i in range(gif.n_frames):
        gif.seek(i); total += gif.info['duration']
    assert total == sum(durations)
    print(f'{len(frames)} frames, video-based gesture {sum(durations[1:-1])} ms, loop {total} ms.')


if __name__ == '__main__':
    main()
