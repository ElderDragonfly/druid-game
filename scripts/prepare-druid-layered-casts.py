"""Four casts with one body, rather than an idle cloak over a second body.

Retain authored arm poses and branch angles. A generated source supplies only
small hidden-cloth repairs where the idle staff/holding hand are removed.
"""
import json
from pathlib import Path
import runpy

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_fill_holes, distance_transform_edt, label

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-cast-layer-fix-v1'
right = runpy.run_path(str(ROOT / 'scripts/prepare-druid-right-casts.py'))
diagonal = runpy.run_path(str(ROOT / 'scripts/prepare-druid-diagonal-casts.py'))
base, old = right['base'], right['old']
rgba, clean = base['rgba'], base['clean']
SIZE, OFFSET = base['SIZE'], base['OFFSET']
DIRECTIONS = ('up', 'up-left', 'up-right', 'right')
ROOTS = {'up': (90, 112), 'up-left': (94, 116), 'up-right': (164, 109), 'right': (179, 111)}
REMOVAL = {
    'up': ((40, 27), (79, 27), (77, 108), (91, 123), (90, 143), (72, 145),
           (76, 297), (53, 300), (54, 200), (52, 142), (45, 126), (45, 85), (40, 75)),
    'up-left': ((38, 23), (87, 23), (87, 110), (99, 119), (99, 146),
                (93, 151), (95, 284), (60, 287), (60, 150), (55, 141), (55, 115), (38, 112)),
    'up-right': ((166, 24), (211, 24), (211, 66), (188, 108), (184, 155),
                 (181, 190), (176, 230), (172, 274), (156, 274), (158, 210), (166, 176), (168, 128), (169, 92)),
    'right': ((151, 26), (199, 26), (199, 69), (177, 98), (176, 119), (177, 131),
              (170, 147), (167, 151), (166, 196), (158, 232), (150, 271), (138, 274), (139, 230),
              (145, 180), (150, 144), (148, 128), (150, 104), (153, 80), (139, 65), (138, 51), (149, 58)),
}
ENVELOPE = {
    'up': ((125, 20), (151, 35), (163, 70), (181, 96), (190, 115), (177, 150),
           (177, 166), (192, 205), (204, 223), (186, 239), (146, 247), (94, 240),
           (71, 222), (60, 210), (65, 174), (73, 145), (76, 105), (99, 70)),
    'up-left': ((128, 20), (150, 35), (161, 60), (185, 79), (205, 109), (202, 141),
                (207, 174), (219, 215), (213, 233), (178, 257), (151, 258), (110, 244),
                (78, 230), (72, 219), (76, 176), (81, 149), (80, 116), (91, 90), (108, 79), (94, 59)),
    'up-right': ((130, 20), (156, 37), (165, 65), (160, 91), (157, 111), (175, 144),
                 (174, 199), (183, 236), (163, 260), (111, 264), (70, 257), (41, 234),
                 (44, 205), (65, 145), (76, 100), (95, 66)),
    'right': ((120, 20), (146, 35), (154, 56), (151, 86), (148, 108), (147, 140),
              (149, 160), (151, 216), (148, 239), (155, 260), (140, 275), (110, 272),
              (78, 267), (45, 244), (37, 236), (56, 175), (76, 112), (94, 72)),
}


def polygon(points):
    image = Image.new('1', (256, 320)); ImageDraw.Draw(image).polygon(points, fill=1)
    return np.array(image)


def fixed_body(direction, idle, pose):
    original = np.array(idle)
    target_top = np.where(original[:, :, 3] > 0)[0].min()
    target_bottom = np.where(original[:, :, 3] > 0)[0].max() + 1
    scale = (target_bottom - target_top) / (pose['bottom'] - pose['top'])
    patch = clean(pose['image'].transform((256, 320), Image.Transform.AFFINE,
        (1 / scale, 0, pose['anchor'] - base['hood_anchor'](idle) / scale,
         0, 1 / scale, pose['bottom'] - target_bottom / scale), Image.Resampling.BICUBIC))
    patch = base['art']['palette_match']([patch])[0]
    patch_pixels = np.array(patch)
    removal = polygon(REMOVAL[direction])
    yy, xx = np.indices((320, 256))
    if direction == 'up-right':
        # The visible hanging arm is the FREE right arm, not the far staff arm.
        removal &= ~polygon(((138, 118), (151, 119), (157, 138), (160, 150), (168, 169),
                              (174, 179), (175, 189), (165, 197), (153, 195), (145, 178), (136, 153), (129, 138)))
    # Keep the original warm leather at the feet where it meets the old shaft.
    hsv = np.array(idle.convert('RGB').convert('HSV'))
    boots = (yy >= 230) & (hsv[:, :, 0] <= 19) & (hsv[:, :, 1] >= 60)
    boots &= (original[:, :, 3] > 0) & (hsv[:, :, 2] > 35)
    # Brown shaft shadows can share boot hues; protect only the leg area,
    # not the old branch standing beside/behind the feet.
    boot_area = {'up': xx >= 85, 'up-left': (xx >= 90) | (yy >= 280),
                 'up-right': (xx < 156) | (yy >= 274),
                 'right': (xx < 138) | (yy >= 274)}[direction]
    boots &= boot_area
    removal &= ~boots
    if direction == 'up-left':
        # The last dark pixels of the old branch share the boot palette,
        # but sit above the toe at the former shaft end.
        removal |= (xx >= 76) & (xx <= 85) & (yy >= 274) & (yy <= 284)
    # The old hand/shaft can enclose background gaps over the cloak. Repair
    # those gaps too, while staying within each standing row's outer bounds.
    row_span = np.zeros((320, 256), dtype=bool)
    for y in range(320):
        columns = np.where(original[y, :, 3] > 0)[0]
        if len(columns): row_span[y, columns.min():columns.max() + 1] = True
    fill = removal & polygon(ENVELOPE[direction]) & row_span
    # Only cloth is wanted in the rear views. A proposed source's hanging
    # sleeve must never become a second stationary holding arm.
    cloth = base['art']['cloth_mask'](patch)
    need_cloth = direction in ('up', 'up-left')
    patch_hsv = np.array(patch.convert('RGB').convert('HSV'))
    skin_or_cuff = ((patch_hsv[:, :, 0] <= 27) & (patch_hsv[:, :, 1] >= 65) & (patch_hsv[:, :, 2] >= 135))
    skin_or_cuff |= (patch_hsv[:, :, 1] < 100) & (patch_hsv[:, :, 2] >= 150)
    # Rear cloth is copied from the visible native cape: the proposed sheet's
    # left sleeve is not a reliable source for this occluded strip.
    missing = fill if need_cloth else fill & ((patch_pixels[:, :, 3] == 0) | skin_or_cuff)
    if missing.any():
        native_cloth = base['art']['cloth_mask'](idle) & (hsv[:, :, 0] >= 38)
        native_fabric = native_cloth.copy()
        if not need_cloth:
            native_fabric |= (yy > 95) & (yy < 230) & (hsv[:, :, 2] < 135) & (original[:, :, 3] > 0)
        native_fabric &= ~removal
        _, nearest = distance_transform_edt(~native_fabric, return_indices=True)
        patch_pixels[missing] = original[nearest[0][missing], nearest[1][missing]]
    pixels = original.copy(); pixels[removal] = 0; pixels[fill] = patch_pixels[fill]
    # Broad shaft masks must not eat the existing cloak edge. Keep the
    # original connected cloth itself, rather than repairing visible fabric.
    cloth_parts, _ = label(base['art']['cloth_mask'](idle), np.ones((3, 3)))
    cloak = (cloth_parts == np.argmax(np.bincount(cloth_parts.ravel())[1:]) + 1) & (hsv[:, :, 0] >= 38)
    pixels[cloak] = original[cloak]
    pixels[~row_span] = 0  # no row widens beyond the standing PNG's outer bounds
    # Remove tiny disconnected remnants of the old branch, recording them.
    regions, count = label(pixels[:, :, 3] > 0, np.ones((3, 3)))
    sizes = np.bincount(regions.ravel()); largest = np.argmax(sizes[1:]) + 1
    for component in range(1, count + 1):
        if component == largest: continue
        fragment = regions == component
        # A hidden-cloth patch over the old shaft can leave a small island
        # outside the connected cloak; it is not part of the body plate.
        repair_island = sizes[component] <= 64 and np.all(removal[fragment])
        assert sizes[component] <= 4 or repair_island, (direction, 'Detached fixed-body fragment', sizes[component],
            (int(xx[regions == component].min()), int(yy[regions == component].min()),
             int(xx[regions == component].max()), int(yy[regions == component].max())))
        pixels[fragment] = 0; removal |= fragment
    assert np.array_equal(pixels[~removal], original[~removal])
    Image.fromarray(removal.astype('uint8') * 255).save(OUT / f'body-edit-mask-{direction}.png', optimize=True)
    return clean(Image.fromarray(pixels))


def arm_only(body, grip, direction):
    data = np.array(body)
    mask = Image.new('1', (256, 320)); draw = ImageDraw.Draw(mask)
    root = ROOTS[direction]
    draw.line((root, tuple(grip)), fill=1, width=30)
    for x, y in (root, grip): draw.ellipse((x - 15, y - 15, x + 15, y + 15), fill=1)
    region = np.array(mask)
    yy, xx = np.indices((320, 256))
    if direction == 'up-right': region &= ~((yy >= 134) & (xx < 180))
    # Do not take any source head, belt or hanging free hand with this arm.
    region &= ~((yy < 94) & (xx < 180) & (xx > 90))
    # The upper sleeve can be olive like the cape. Keep the connected pixels
    # in this narrow shoulder-to-fist region; the single fixed body occludes
    # its root. Taking a whole generated body here causes the double hem.
    selected = region & (data[:, :, 3] > 0)
    parts, count = label(selected, np.ones((3, 3)))
    _, hand = base['hand_for'](body, grip)
    scores = [np.count_nonzero((parts == n) & hand) for n in range(1, count + 1)]
    assert scores and max(scores) > 100, (direction, grip, 'Missing actual holding hand')
    part = int(np.argmax(scores)) + 1
    selected = binary_fill_holes(parts == part) & region & (data[:, :, 3] > 0)
    data[~selected] = 0
    return clean(Image.fromarray(data))


def main():
    OUT.mkdir(exist_ok=True)
    poses = base['art']['split_poses'](OUT / 'body-clean-source.png', 4, 2)
    old_manifest = json.loads((base['OUT'] / 'art.json').read_text())
    diagonal_manifest = json.loads((diagonal['OUT'] / 'art.json').read_text())
    metadata = {'integrated': True, 'frameWidth': 512, 'frameHeight': 384, 'idleOffset': OFFSET,
        'durationMs': 670, 'layers': ['moving staff', 'moving left arm', 'single stationary body'],
        'acceptedDown': 'not read or regenerated; runtime source unchanged', 'directions': {}}
    staff = rgba(ROOT / 'docs/art/druid-cast-down-v1/staff-master-256x320.png')
    for direction, pose in zip(DIRECTIONS, poses):
        idle = rgba(ROOT / f'docs/art/druid-eight-way-v1/idle-{direction}-256x320.png')
        fixed = fixed_body(direction, idle, pose)
        fixed.save(OUT / f'body-{direction}-fixed-256x320.png', optimize=True)
        body_layer = Image.new('RGBA', SIZE); body_layer.paste(fixed, OFFSET)
        first = Image.new('RGBA', SIZE); first.paste(idle, OFFSET)
        bodies = base['body_frames'](direction, idle)
        grips = old_manifest['directions'][direction]['gripCenters']
        edits = right['edited_bodies'](direction, idle) if direction in ('right', 'up-right') else None
        frames, arms, branches, points, angles = [first], [], [], [], []
        for phase, body in enumerate(bodies):
            grip = np.array(grips[phase])
            patched = edits is not None and phase in (2, 3)
            if patched:
                new_grip, _ = base['hand_for'](edits[phase], (223, 108))
                body, _ = right['arm_patch'](body, edits[phase], right['ROOTS'][direction], grip, new_grip, direction)
                grip, _ = base['hand_for'](body, new_grip)
            arm = arm_only(body, grip, direction)
            # The old right-view drawings place the shoulder 18 px farther
            # forward than the approved idle. Register arm and branch together
            # at that shoulder; never bridge the gap with a second torso.
            registration = np.array((-18, 0) if direction == 'right' else (0, 0))
            arm_layer = Image.new('RGBA', SIZE); arm_layer.paste(arm, tuple(np.array(OFFSET) + registration))
            if direction == 'up-left':
                angle = diagonal_manifest['directions'][direction]['staffAnglesDegrees'][phase]
            else:
                angle = old['ANGLES'][phase] * base['SIGNS'][direction]
                if not patched: angle = diagonal['fit_angle'](staff, grip, angle)
            grip = grip + registration
            branch = old['position_staff'](staff, grip, angle)
            frame = branch.copy(); frame.alpha_composite(arm_layer); frame.alpha_composite(body_layer)
            data = np.array(frame); parts, count = label(data[:, :, 3] > 0, np.ones((3, 3)))
            sizes = np.bincount(parts.ravel()); largest = np.argmax(sizes[1:]) + 1
            for component in range(1, count + 1):
                if component == largest: continue
                assert sizes[component] <= 4, (direction, phase, 'Detached moving part', sizes[component])
                data[parts == component] = 0
            # Every opaque pixel of the ONE fixed body survives untouched.
            opaque = np.array(body_layer)[:, :, 3] > 0
            assert np.array_equal(data[opaque], np.array(body_layer)[opaque])
            allowed = opaque | (np.array(arm_layer)[:, :, 3] > 0) | (np.array(branch)[:, :, 3] > 0)
            assert not np.any((data[:, :, 3] > 0) & ~allowed), 'Second body outside authored layers'
            assert set(np.unique(data[:, :, 3])) <= {0, 255}
            frame = Image.fromarray(data); x0, y0, x1, y1 = frame.getbbox()
            assert x0 > 0 and y0 > 0 and x1 < SIZE[0] and y1 < SIZE[1]
            frames.append(frame); arms.append(arm_layer); branches.append(branch)
            points.append(grip.tolist()); angles.append(angle)
        frames.append(first.copy())
        old['strip'](frames).save(OUT / f'cast-{direction}-512x384.png', optimize=True)
        old['strip'](arms).save(OUT / f'arm-{direction}-poses-512x384.png', optimize=True)
        old['strip'](branches).save(OUT / f'staff-{direction}-poses-512x384.png', optimize=True)
        contact = Image.new('RGBA', (SIZE[0] * 4, SIZE[1] * 2))
        for i, frame in enumerate(frames): contact.paste(frame, (i % 4 * SIZE[0], i // 4 * SIZE[1]))
        old['preview'](contact).save(OUT / f'cast-{direction}-keyframes.png', optimize=True)
        palette = old['preview'](contact).quantize(colors=256, dither=Image.Dither.NONE)
        gifs = [old['preview'](f).quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
        gifs[0].save(OUT / f'cast-{direction}-preview.gif', save_all=True, append_images=gifs[1:],
                     duration=list(old['DURATIONS']), loop=0, disposal=2, optimize=False)
        metadata['directions'][direction] = {'gripCenters': points, 'staffAnglesDegrees': angles,
            'body': f'body-{direction}-fixed-256x320.png', 'oneBodyOnly': True}
        print(direction, 'one body, authored left arm and staff; fixed body pixels verified')
    (OUT / 'art.json').write_text(json.dumps(metadata, indent=2) + '\n')


if __name__ == '__main__': main()
