"""Slow inclined semicircle: one fixed canonical body, articulated left arm.

Original body pixels are retained outside a small arm/staff removal mask.
Only that hidden fabric is taken from the repaired drawing. A single wooden
staff is projected in depth; the body never changes scale, width or position.
"""
import hashlib
import json
from pathlib import Path
import runpy

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_dilation, binary_fill_holes, label

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-cast-down-v2'
REF = ROOT / 'docs/art/druid-front-refinement-v2/idle-down-256x320.png'
v1 = runpy.run_path(str(ROOT / 'scripts/prepare-druid-cast-down.py'))
clean = v1['clean']
SIZE, OFFSET = (512, 384), np.array((128., 40.))
ROOT_JOINT = np.array((166., 110.))
UPPER_LENGTH, FORE_LENGTH = 24., 20.
CAST_HAND = np.array((177., 146.))
REST_HAND = np.array((195., 135.))


def rgba(path): return Image.open(path).convert('RGBA')


def polygon(points):
    mask = Image.new('1', (256, 320)); ImageDraw.Draw(mask).polygon(points, fill=1)
    return np.array(mask)


def fixed_body():
    reference = rgba(REF); original = np.array(reference)
    repair = rgba(OUT / 'body-clean-source.png'); data = np.array(repair)
    regions, _ = label(data[:, :, 3] >= 128, np.ones((3, 3)))
    component = np.argmax(np.bincount(regions.ravel())[1:]) + 1
    yy, xx = np.indices(regions.shape); y, _ = np.where(regions == component)
    top, bottom = int(y.min()), int(y.max() + 1)
    hsv = np.array(repair.convert('RGB').convert('HSV'))
    face = (regions == component) & (yy > top + .10 * (bottom - top)) & (yy < top + .20 * (bottom - top))
    face &= (hsv[:, :, 0] <= 27) & (hsv[:, :, 1] >= 65) & (hsv[:, :, 2] >= 135)
    face_x = float(np.median(xx[face]))
    scale = 277 / (bottom - top)
    data[regions != component] = 0
    repaired = clean(Image.fromarray(data).transform((256, 320), Image.Transform.AFFINE,
        (1 / scale, 0, face_x - 123 / scale, 0, 1 / scale, bottom - 298 / scale), Image.Resampling.BICUBIC))
    repaired = v1['old']['palette_match']([repaired])[0]
    removal = polygon(((164, 103), (178, 105), (188, 114), (195, 121), (207, 121),
        (212, 130), (210, 143), (200, 150), (185, 149), (173, 140), (165, 132), (161, 120)))
    removal |= binary_dilation(np.array(rgba(OUT / 'staff-master-256x320.png'))[:, :, 3] > 0, iterations=2)
    boots = polygon(((80, 240), (110, 240), (115, 299), (80, 299)))
    boots |= polygon(((139, 236), (157, 234), (175, 249), (178, 261), (173, 272), (153, 273), (138, 257)))
    removal &= ~boots
    # The hidden cape may be repaired only within the original torso envelope;
    # the old staff over empty background must become transparent.
    envelope = polygon(((160, 97), (181, 111), (195, 138), (202, 167), (207, 199),
        (207, 214), (197, 225), (176, 224), (163, 201), (152, 166), (151, 119)))
    patched = original.copy(); patch = np.array(repaired)
    patched[removal] = 0
    fill = removal & envelope
    patched[fill] = patch[fill]
    # Fixed backdrop is byte-identical everywhere except the occluded repair.
    assert np.array_equal(patched[~removal], original[~removal])
    body = clean(Image.fromarray(patched))
    body.save(OUT / 'body-fixed-256x320.png', optimize=True)
    Image.fromarray(removal.astype('uint8') * 255).save(OUT / 'body-edit-mask.png', optimize=True)
    return body, removal


def arm_parts():
    # This already drawn arm has a clean empty gripping fist. Reuse it once,
    # rather than re-generating the whole figure with changing proportions.
    source = rgba(ROOT / 'docs/art/druid-cast-down-v1/body-poses-512x384.png').crop(
        (5 * 512 + 128, 40, 5 * 512 + 384, 360))
    pixels = np.array(source); hsv = np.array(source.convert('RGB').convert('HSV'))
    yy, xx = np.indices((320, 256))
    arm = polygon(((164, 104), (179, 106), (190, 114), (199, 121), (217, 125),
        (224, 132), (224, 145), (215, 151), (203, 151), (189, 143), (175, 138), (165, 129)))
    arm &= (pixels[:, :, 3] > 0)
    arm &= ~((hsv[:, :, 0] >= 32) & (hsv[:, :, 0] <= 110) & (hsv[:, :, 1] >= 40))
    start = np.array((168., 110.)); elbow = np.array((193., 130.)); hand = np.array((210., 139.))
    axis = hand - elbow
    along = (xx - elbow[0]) * axis[0] + (yy - elbow[1]) * axis[1]
    cuff = arm & (xx <= 198) & (yy <= 135) & (hsv[:, :, 1] < 110) & (hsv[:, :, 2] > 130)
    upper_mask = arm & ((along <= 30) | cuff)
    upper_mask &= ~((yy >= 118) & (xx < 171))  # old cape outline, not sleeve
    fore_mask = arm & (along >= -35) & ~cuff
    skin = fore_mask & (hsv[:, :, 0] <= 27) & (hsv[:, :, 1] >= 65) & (hsv[:, :, 2] >= 140)
    skin &= (xx >= 199) & (yy >= 125)
    hand_mask = binary_dilation(binary_fill_holes(skin), iterations=2) & fore_mask
    result = []
    for name, mask in (('upper-arm', upper_mask), ('forearm', fore_mask), ('hand', hand_mask)):
        data = pixels.copy(); data[~mask] = 0
        regions, _ = label(data[:, :, 3] > 0, np.ones((3, 3)))
        main = np.argmax(np.bincount(regions.ravel())[1:]) + 1
        data[regions != main] = 0
        image = clean(Image.fromarray(data)); image.save(OUT / f'{name}-256x320.png', optimize=True)
        result.append(image)
    return (*result, start, elbow, hand)


def segment(image, source_start, source_end, target_start, target_end):
    original = source_end - source_start; wanted = target_end - target_start
    original /= np.linalg.norm(original); direction = wanted / np.linalg.norm(wanted)
    a = np.stack((original, (-original[1], original[0])), axis=1)
    b = np.stack((direction, (-direction[1], direction[0])), axis=1)
    stretch = np.diag((np.linalg.norm(wanted) / np.linalg.norm(source_end - source_start), 1.))
    inverse = np.linalg.inv(b @ stretch @ a.T)
    offset = source_start - inverse @ (target_start + OFFSET)
    return clean(image.transform(SIZE, Image.Transform.AFFINE,
        (*inverse[0], offset[0], *inverse[1], offset[1]), Image.Resampling.BICUBIC))


def elbow_for(hand):
    delta = hand - ROOT_JOINT; distance = np.linalg.norm(delta)
    assert abs(UPPER_LENGTH - FORE_LENGTH) < distance < UPPER_LENGTH + FORE_LENGTH
    direction = delta / distance
    a = (UPPER_LENGTH ** 2 - FORE_LENGTH ** 2 + distance ** 2) / (2 * distance)
    height = np.sqrt(max(0, UPPER_LENGTH ** 2 - a ** 2))
    # Same bend branch for the entire gesture: no elbow flipping at the centre.
    return ROOT_JOINT + a * direction + height * np.array((-direction[1], direction[0]))


def projected_staff(staff, hand, up, grip):
    across = np.array((-up[1], up[0])) / np.linalg.norm(up)
    source_up = np.array((207., 23.)) - grip
    source_up /= np.linalg.norm(source_up)
    source_across = np.array((-source_up[1], source_up[0]))
    # Register the actual fork tip, not an imaginary vertical source axis.
    # Thus the visible upper end itself follows the intended semicircle.
    source_basis = np.stack((source_across, source_up), axis=1)
    forward = np.stack((across, up), axis=1) @ source_basis.T
    inverse = np.linalg.inv(forward); offset = grip - inverse @ (hand + OFFSET)
    return clean(staff.transform(SIZE, Image.Transform.AFFINE,
        (*inverse[0], offset[0], *inverse[1], offset[1]), Image.Resampling.BICUBIC))


def arc_up(theta):
    # Oblique projected semicircle. At 28-degree camera elevation this is a
    # forward staff inclination of about 43–50 degrees, not a flat 2D spin.
    return np.array((.35 * np.cos(theta), -.32 + .10 * np.sin(theta) + .06 * np.cos(theta)))


def ease(value): return .5 - .5 * np.cos(np.pi * value)


def main():
    body, removal = fixed_body()
    upper, fore, palm, source_start, source_elbow, source_hand = arm_parts()
    staff = rgba(OUT / 'staff-master-256x320.png')
    fixed = Image.new('RGBA', SIZE); fixed.paste(body, tuple(OFFSET.astype(int)))
    original = rgba(REF); idle = Image.new('RGBA', SIZE); idle.paste(original, tuple(OFFSET.astype(int)))
    source = np.array(original); hsv = np.array(original.convert('RGB').convert('HSV'))
    yy, xx = np.indices((320, 256))
    shoulder = ((xx - 166) ** 2 + (yy - 110) ** 2 <= 15 ** 2) & (yy <= 121)
    shoulder &= (source[:, :, 3] > 0) & (hsv[:, :, 0] >= 32) & (hsv[:, :, 0] <= 110)
    source[~shoulder] = 0
    cover = Image.new('RGBA', SIZE); cover.paste(Image.fromarray(source), tuple(OFFSET.astype(int)))
    frames, durations, poses = [idle], [500], []

    def append(hand, up, grip, phase, milliseconds=50):
        elbow = elbow_for(hand)
        sleeve = segment(upper, source_start, source_elbow, ROOT_JOINT, elbow)
        forearm = segment(fore, source_elbow, source_hand, elbow, hand)
        hand_layer = segment(palm, source_elbow, source_hand, elbow, hand)
        branch = projected_staff(staff, hand, up, grip)
        frame = fixed.copy()
        for layer in (sleeve, forearm, branch, hand_layer, cover): frame.alpha_composite(layer)
        frames.append(clean(frame)); durations.append(milliseconds)
        poses.append({'phase': phase, 'hand': hand.tolist(), 'elbow': elbow.tolist(),
                      'staffUp': up.tolist(), 'staffGrip': grip.tolist()})

    rest_grip = np.array((196., 135.)); cast_grip = np.array((193., 155.))
    rest_up = np.array((207., 23.)) - rest_grip; rest_up /= np.linalg.norm(rest_up)
    for i in range(1, 7):
        t = ease(i / 6)
        append(REST_HAND * (1 - t) + CAST_HAND * t, rest_up * (1 - t) + arc_up(0) * t,
               rest_grip * (1 - t) + cast_grip * t, 'incline')
    for i in range(1, 37):
        append(CAST_HAND, arc_up(np.pi * ease(i / 36)), cast_grip, 'semicircle')
    for i in range(1, 15):
        t = ease(i / 14)
        append(CAST_HAND * (1 - t) + REST_HAND * t, arc_up(np.pi) * (1 - t) + rest_up * t,
               cast_grip * (1 - t) + rest_grip * t, 'return')
    frames.append(idle.copy()); durations.append(650)

    columns = 6; rows = (len(frames) + columns - 1) // columns
    atlas = Image.new('RGBA', (columns * SIZE[0], rows * SIZE[1]))
    for i, frame in enumerate(frames): atlas.paste(frame, ((i % columns) * SIZE[0], (i // columns) * SIZE[1]))
    atlas.save(OUT / 'cast-down-sheet.png', optimize=True)
    keys = (0, 6, 12, 22, 32, 42, 49, len(frames) - 1)
    contact = Image.new('RGBA', (4 * SIZE[0], 2 * SIZE[1]))
    for j, i in enumerate(keys): contact.paste(frames[i], ((j % 4) * SIZE[0], (j // 4) * SIZE[1]))
    v1['preview'](contact).save(OUT / 'cast-down-keyframes.png', optimize=True)
    palette = v1['preview'](atlas).quantize(colors=256, dither=Image.Dither.NONE)
    gifs = [v1['preview'](frame).quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    gifs[0].save(OUT / 'cast-down-preview.gif', save_all=True, append_images=gifs[1:], duration=durations,
                 loop=0, disposal=2, optimize=False)

    metadata = {'integrated': False, 'direction': 'down', 'staffHand': 'anatomical-left',
        'frameWidth': SIZE[0], 'frameHeight': SIZE[1], 'sourceFrameCount': len(frames),
        'atlasColumns': columns, 'atlasRows': rows, 'frameDurationsMs': durations,
        'gestureDurationMs': sum(durations[1:-1]), 'semicircleDurationMs': 1800,
        'loopDurationMs': sum(durations), 'body': 'one fixed canonical layer, no scaling or pose replacement',
        'bodySha256': hashlib.sha256(body.tobytes()).hexdigest(),
        'bodyRepair': 'only old left arm/staff footprint; original pixels exact elsewhere',
        'armLengths': [UPPER_LENGTH, FORE_LENGTH], 'staffInclinationDegreesApprox': [43, 50],
        'motion': 'upper end makes a small oblique semicircle in front of chest; lower end nearer body',
        'poses': poses}
    (OUT / 'art.json').write_text(json.dumps(metadata, indent=2) + '\n')
    assert np.array_equal(np.array(body)[~removal], np.array(original)[~removal])
    assert np.array_equal(np.array(frames[0]), np.array(frames[-1]))
    for frame in frames:
        assert set(np.unique(np.array(frame)[:, :, 3])) <= {0, 255}
        assert np.array_equal(np.array(frame)[85:125, 228:268], np.array(original)[45:85, 100:140]), 'Face changed'
        x0, y0, x1, y1 = frame.getbbox()
        assert x0 > 0 and y0 > 0 and x1 < SIZE[0] and y1 < SIZE[1]
    gif = Image.open(OUT / 'cast-down-preview.gif'); total = 0
    for i in range(gif.n_frames): gif.seek(i); total += gif.info['duration']
    assert total == sum(durations)
    assert max(np.linalg.norm(np.array(p['hand']) - np.array(p['elbow'])) for p in poses) < FORE_LENGTH + .01
    sweep = [p for p in poses if p['phase'] == 'semicircle']
    assert len(sweep) == 36 and all(sweep[i]['staffUp'][0] >= sweep[i + 1]['staffUp'][0] for i in range(35))
    # Independent 3D inclination check under the established elevated camera.
    up = np.array([p['staffUp'] for p in sweep]); elevation = np.deg2rad(28)
    depth = np.sqrt(1 - (up ** 2).sum(axis=1))
    vertical = -up[:, 1] * np.cos(elevation) + depth * np.sin(elevation)
    inclinations = np.rad2deg(np.arccos(vertical))
    assert inclinations.min() >= 40 and inclinations.max() <= 52
    print(f'Fixed body; {len(frames)} source frames; semicircle 1800 ms; gesture {sum(durations[1:-1])} ms; loop {total} ms.')


if __name__ == '__main__': main()
