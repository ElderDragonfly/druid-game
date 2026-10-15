"""Accepted detailed Basic 04 front assets, now used by the game.

Idle is reduced from the approved Basic 04, with a local rope-knot correction.
The four drawn body poses receive local face and knot edits. One forearm/staff
cutout moves rigidly over solid cloth. Pillow, NumPy, SciPy.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_fill_holes, distance_transform_edt, label
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-front-refinement-v2'
REFERENCE = ROOT / 'docs/art/druid-sprites-v1/druid-04-basic.png'
SIZE = (256, 320)
BASELINE = 300
VISIBLE_HEIGHT = 280
FRAME_MS = 240
BACKGROUND = (38, 54, 40, 255)
SPINES = (400, 875, 400, 875)
# One staff plant per two alternating steps, with a raised passing phase.
LIFT = (0, 6, 12, 6)
# Coordinates relative to the waist crop (88,124)-(168,204). Covers the old
# knot/tails as well as their replacements, leaving the belt and cloth intact
# everywhere outside this small polygon.
TIE_POLYGON = [(28, 17), (37, 17), (43, 23), (42, 30), (42, 51),
               (34, 51), (33, 36), (30, 45), (24, 47), (21, 43),
               (25, 32), (29, 26), (27, 22)]


def save(image, name):
    pixels = np.array(image)
    pixels[pixels[:, :, 3] == 0] = 0
    Image.fromarray(pixels).save(OUT / name, optimize=True)


def parts(image, count):
    rgba = np.array(image.convert('RGBA'))
    components, _ = label(rgba[:, :, 3] >= 128, np.ones((3, 3)))
    counts = np.bincount(components.ravel())
    ids = np.argsort(counts[1:])[-count:] + 1
    ids = sorted(ids, key=lambda i: (np.where(components == i)[0].min() > image.height / 2,
                                    np.where(components == i)[1].min()))
    result = []
    hsv = np.array(image.convert('RGB').convert('HSV'))
    yy, xx = np.indices(components.shape)
    for index, component in enumerate(ids):
        y, _ = np.where(components == component)
        top, ground = int(y.min()), int(y.max() + 1)
        spine = 625 if count == 1 else SPINES[index]
        # Register the face AND torso, never the swinging feet or cloak bounds.
        skin = (components == component) & (yy >= top + .10 * (ground - top)) & (yy < top + .33 * (ground - top))
        skin &= (abs(xx - spine) < .16 * (ground - top)) & (hsv[:, :, 0] >= 6) & (hsv[:, :, 0] <= 27)
        skin &= (hsv[:, :, 1] > 45) & (hsv[:, :, 2] > 90)
        face_x = float(np.median(np.where(skin)[1]))
        anchor_x = (spine + face_x) / 2
        data = rgba.copy()
        # Idle retains the approved image, including all of its opaque pixels.
        if count != 1:
            data[:, :, 3] = np.where(components == component, data[:, :, 3], 0)
        result.append({'image': Image.fromarray(data), 'top': top, 'ground': ground,
                       'anchorX': anchor_x, 'faceX': face_x, 'spineX': spine})
    return result


def render(image, anchor_x, ground, scale):
    frame = image.transform(SIZE, Image.Transform.AFFINE,
        (1 / scale, 0, anchor_x - SIZE[0] / 2 / scale,
         0, 1 / scale, ground - BASELINE / scale), Image.Resampling.BICUBIC)
    data = np.array(frame)
    data[:, :, 3] = np.where(data[:, :, 3] >= 128, 255, 0)
    return Image.fromarray(data)


def match_cloth(image):
    """Use actual Basic cloth/boot RGBs; keep contrast, faces and the staff."""
    data = np.array(image)
    hsv = np.array(image.convert('RGB').convert('HSV'))
    reference = np.array(Image.open(REFERENCE).convert('RGBA'))
    ref_hsv = np.array(Image.fromarray(reference[:, :, :3]).convert('HSV'))
    yy, _ = np.indices(data.shape[:2])
    green = (data[:, :, 3] > 0) & (hsv[:, :, 0] >= 32) & (hsv[:, :, 0] <= 110) & (hsv[:, :, 1] >= 46)
    brown = (data[:, :, 3] > 0) & (yy >= 230) & (hsv[:, :, 0] >= 8) & (hsv[:, :, 0] < 32) & (hsv[:, :, 1] >= 46)
    ref_green = (reference[:, :, 3] >= 128) & (ref_hsv[:, :, 0] >= 32) & (ref_hsv[:, :, 0] <= 110) & (ref_hsv[:, :, 1] >= 46)
    ref_brown = np.zeros(reference.shape[:2], dtype=bool)
    for left, top, right, bottom in [(460, 885, 555, 945), (660, 880, 730, 925), (460, 1060, 515, 1130)]:
        ref_brown[top:bottom, left:right] = True
    ref_brown &= (reference[:, :, 3] >= 128) & (ref_hsv[:, :, 0] >= 8) & (ref_hsv[:, :, 0] < 32) & (ref_hsv[:, :, 1] >= 46)
    for mask, samples in [(green, ref_green), (brown, ref_brown)]:
        palette = np.unique(reference[:, :, :3][samples], axis=0)
        colors, inverse = np.unique(data[:, :, :3][mask], axis=0, return_inverse=True)
        mapped = palette[cKDTree(palette.astype(float)).query(colors.astype(float))[1]]
        data[:, :, :3][mask] = mapped[inverse]
    return Image.fromarray(data)


def staff_cutout(source):
    """Cut the first drawn forearm/staff once; retain its fork and wood texture."""
    mask = Image.new('L', source.size)
    draw = ImageDraw.Draw(mask)
    draw.polygon([(520, 80), (578, 80), (605, 115), (605, 164), (571, 209),
        (562, 273), (566, 337), (548, 364), (554, 430), (544, 480),
        (540, 520), (530, 620), (492, 620), (500, 505), (510, 449),
        (509, 398), (513, 361), (514, 329), (515, 269), (515, 230),
        (509, 203), (513, 173), (510, 132)], fill=255)
    rgba = np.array(source)
    wood = np.array(mask)
    # Follow each shaft row's brown silhouette; keep moss inside its boundary,
    # exclude the green cloak next to it. Fork openings retain original alpha.
    for y in range(80, 620):
        row = rgba[y, :, :3].astype(int)
        brown = np.where((wood[y] > 0) & (rgba[y, :, 3] >= 128) &
                         (row[:, 0] > row[:, 1] + 8) & (row[:, 1] > row[:, 2] + 5))[0]
        if len(brown):
            wood[y, :max(0, int(brown.min()) - 2)] = 0
            wood[y, int(brown.max()) + 3:] = 0
    mask = Image.fromarray(wood)
    draw = ImageDraw.Draw(mask)
    draw.polygon([(452, 240), (476, 243), (493, 252), (511, 262), (527, 280),
        (547, 280), (562, 288), (566, 313), (555, 330), (537, 337),
        (521, 330), (504, 319), (486, 314), (471, 299), (461, 278),
        (450, 262)], fill=255)
    rgba[:, :, 3] = np.minimum(rgba[:, :, 3], np.array(mask))
    return Image.fromarray(rgba)


def opaque_body(image):
    data = np.array(image)
    alpha = data[:, :, 3] > 0
    yy, xx = np.indices(alpha.shape)
    # Repair enclosed cloth gaps, preserving the natural opening between legs.
    holes = binary_fill_holes(alpha) & ~alpha & ((yy < 235) | (xx < 96) | (xx > 164))
    nearest = distance_transform_edt(~alpha, return_distances=False, return_indices=True)
    data[holes] = data[nearest[0][holes], nearest[1][holes]]
    return Image.fromarray(data)


def strip(frames):
    result = Image.new('RGBA', (SIZE[0] * len(frames), SIZE[1]))
    for index, frame in enumerate(frames):
        result.paste(frame, (index * SIZE[0], 0))
    return result


def local_edits(frame, index=None):
    """Composite only approved small redraws; never re-register the body.

    index=None is idle: its head stays byte-for-byte unchanged. The native
    source crops are already at output pixel density; no sprite rescaling.
    Original alpha is retained even inside the edits.
    """
    data = np.array(frame)
    if index is not None:
        source = Image.open(OUT / 'walk-local-edit-source.png').convert('RGBA')
        face = source.crop((80 * index, 0, 80 * (index + 1), 80))
        patch = Image.new('RGBA', SIZE)
        patch.paste(face, (88, 32))
        hsv = np.array(frame.convert('RGB').convert('HSV'))
        yy, xx = np.indices((SIZE[1], SIZE[0]))
        # Preserve the actual hood edge, clasp and cloak. Only non-green
        # face/hair/beard pixels inside its opening receive the redraw.
        hood = (hsv[:, :, 0] >= 29) & (hsv[:, :, 0] <= 110) & (hsv[:, :, 1] > 40)
        face_mask = (xx >= 99) & (xx < 151) & (yy >= 48) & (yy < 110)
        face_mask &= ~hood & (data[:, :, 3] > 0)
        data[face_mask, :3] = np.array(patch)[face_mask, :3]
        # Reuse a single drawn knot/tails so the rope cannot change its
        # interlacing from frame to frame; follow only the waist's small bob.
        tie = source.crop((0, 80, 80, 160))
        dx, dy = 0, (0, 0, 4, 3)[index]
    else:
        # Align the newly drawn idle knot to the existing belt, not the face.
        source = Image.open(OUT / 'idle-knot-source.png').convert('RGBA')
        tie = Image.new('RGBA', (80, 80))
        tie.paste(source, (-2, -2))
        dx, dy = 3, -1
    mask = Image.new('L', SIZE)
    ImageDraw.Draw(mask).polygon([(88 + x + dx, 124 + y + dy) for x, y in TIE_POLYGON], fill=255)
    patch = Image.new('RGBA', SIZE)
    patch.paste(tie, (88, 124 + (dy if index is not None else 0)))
    tie_mask = (np.array(mask) > 0) & (data[:, :, 3] > 0)
    data[tie_mask, :3] = np.array(patch)[tie_mask, :3]
    return Image.fromarray(data)


def preview(frame):
    background = Image.new('RGBA', frame.size, BACKGROUND)
    background.alpha_composite(frame)
    return background.convert('RGB')


def main():
    idle_pose = parts(Image.open(REFERENCE).convert('RGBA'), 1)[0]
    idle_scale = VISIBLE_HEIGHT / (idle_pose['ground'] - idle_pose['top'])
    idle = local_edits(render(idle_pose['image'], idle_pose['anchorX'], idle_pose['ground'], idle_scale))
    bodies = parts(Image.open(OUT / 'walk-body-source.png').convert('RGBA'), 4)
    scale = VISIBLE_HEIGHT / max(p['ground'] - p['top'] for p in bodies)
    body_frames = [local_edits(opaque_body(match_cloth(render(p['image'], p['anchorX'], p['ground'], scale))), i)
                   for i, p in enumerate(bodies)]
    source = Image.open(OUT / 'walk-source.png').convert('RGBA')
    master = render(staff_cutout(source), bodies[0]['anchorX'], bodies[0]['ground'], scale)
    tip = master.getbbox()[3]
    planted_offset = BASELINE - tip
    frames, staff_frames, foreground_frames = [], [], []
    for index, body in enumerate(body_frames):
        staff = Image.new('RGBA', SIZE)
        staff.paste(master, (0, planted_offset - LIFT[index]))
        foreground = np.array(body)
        hsv = np.array(body.convert('RGB').convert('HSV'))
        yy, xx = np.indices((SIZE[1], SIZE[0]))
        cape = (xx >= 145) & (xx < 185) & (yy < 117)
        cape &= (hsv[:, :, 0] >= 28) & (hsv[:, :, 0] <= 110) & (hsv[:, :, 1] > 40)
        foreground[:, :, 3][~cape] = 0
        foreground = Image.fromarray(foreground)
        frame = body.copy()
        frame.alpha_composite(staff)
        frame.alpha_composite(foreground)
        frames.append(frame)
        staff_frames.append(staff)
        foreground_frames.append(foreground)
    save(idle, 'idle-down-256x320.png')
    save(strip(frames), 'walk-down-256x320.png')
    save(strip(body_frames), 'walk-body-256x320.png')
    save(strip(staff_frames), 'walk-arm-staff-256x320.png')
    save(strip(foreground_frames), 'walk-cloak-foreground-256x320.png')
    preview(idle).save(OUT / 'idle-down-preview.png')
    preview(strip(frames)).save(OUT / 'walk-down-frames-preview.png')
    # Native-size previews for fair comparison with the old 64x80 ×4 GIF.
    palette = preview(strip(frames)).quantize(colors=256, dither=Image.Dither.NONE)
    gif_frames = [preview(frame).quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    gif_frames[0].save(OUT / 'walk-down-preview.gif', save_all=True, append_images=gif_frames[1:],
                       duration=FRAME_MS, loop=0, disposal=2, optimize=False)
    metadata = {'integrated': True, 'frameWidth': SIZE[0], 'frameHeight': SIZE[1],
        'frameCount': 4, 'frameDurationMs': FRAME_MS, 'previewScale': 1, 'baselineY': BASELINE,
        'idleSource': '../druid-sprites-v1/druid-04-basic.png', 'idleRedrawn': True,
        'localEdits': {'walkSource': 'walk-local-edit-source.png', 'idleSource': 'idle-knot-source.png',
                       'walk': ['forward-facing face', 'compact rope knot and tails'],
                       'idle': ['compact rope knot and tails'], 'originalAlphaPreserved': True,
                       'walkKnotRigidMaster': True, 'walkKnotOffsetY': [0, 0, 4, 3]},
        'walkSource': 'walk-source.png', 'bodySource': 'walk-body-source.png',
        'registration': 'mean of face and torso, independent of feet',
        'walkScale': scale, 'idleScale': idle_scale,
        'anchors': [{k: v for k, v in p.items() if k != 'image'} for p in bodies],
        'staff': {'rigidMaster': True, 'liftPixels': list(LIFT), 'plantedOffsetY': planted_offset,
                  'plantsPerCycle': 1, 'stepsPerCycle': 2},
        'layers': ['walk-body-256x320.png', 'walk-arm-staff-256x320.png', 'walk-cloak-foreground-256x320.png']}
    (OUT / 'art.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print('Accepted front Basic 04: 256x320, four 240ms preview frames, one staff plant per two steps.')


if __name__ == '__main__':
    main()
