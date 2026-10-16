"""Accepted detailed Basic 04 rear walk assets, now imported by the game."""
import json
from pathlib import Path
import runpy

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, label, map_coordinates

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-back-refinement-v1'
SIZE = (256, 320)
BASELINE = 300
LIFT = (0, 6, 12, 6)
FRAME_MS = 240
CLOAK_HEM = ((0, 2), (1, 1), (2, 0), (1, 1))
BOOT_CENTERS = (115, 147)
LEG_SPLITS = (134, 130, 130, 130)
ARM_REGION = (168, 112, 215, 191)
# Lower contour of the accepted first cloak, including its black outline.
# This removes the old legs without removing fabric or its pointed hem.
LEG_OPENING = [(94, 207), (100, 209), (110, 214), (120, 219), (130, 228),
               (136, 239), (139, 239), (145, 234), (150, 231), (155, 226),
               (160, 221), (165, 219), (168, 217), (170, 320), (90, 320), (90, 227)]
# Reuse the accepted front proposal's sizing, palette and solid-cloth helpers.
front = runpy.run_path(str(ROOT / 'scripts/prepare-druid-front-detailed.py'))


def save(image, name):
    data = np.array(image)
    data[data[:, :, 3] == 0] = 0
    Image.fromarray(data).save(OUT / name, optimize=True)


def poses(image):
    rgba = np.array(image)
    components, _ = label(rgba[:, :, 3] >= 128, np.ones((3, 3)))
    counts = np.bincount(components.ravel())
    ids = np.argsort(counts[1:])[-4:] + 1
    ids = sorted(ids, key=lambda k: (np.where(components == k)[0].min() > image.height / 2,
                                    np.where(components == k)[1].min()))
    yy, xx = np.indices(components.shape)
    hsv = np.array(image.convert('RGB').convert('HSV'))
    result = []
    for i, component in enumerate(ids):
        y, _ = np.where(components == component)
        top, ground = int(y.min()), int(y.max() + 1)
        hint = (582, 982, 582, 982)[i]
        hood = (components == component) & (yy < top + .22 * (ground - top)) & (abs(xx - hint) < 60)
        hood &= (hsv[:, :, 0] >= 30) & (hsv[:, :, 0] < 110) & (hsv[:, :, 1] > 40)
        anchor = float(np.median(xx[hood]))
        data = rgba.copy()
        data[:, :, 3] = np.where(components == component, data[:, :, 3], 0)
        result.append({'image': Image.fromarray(data), 'top': top, 'ground': ground, 'anchorX': anchor})
    return result


def staff_cutout(source):
    """One drawn left hand/forearm and complete bare wooden staff, never mirrored."""
    mask = Image.new('L', source.size)
    draw = ImageDraw.Draw(mask)
    draw.polygon([(438, 20), (509, 20), (512, 100), (497, 142), (490, 167),
        (488, 202), (484, 232), (492, 270), (485, 320), (489, 375),
        (490, 430), (486, 465), (464, 465), (462, 420), (466, 380),
        (463, 340), (464, 300), (465, 270), (464, 240), (470, 210),
        (468, 155), (458, 118), (448, 88), (440, 65)], fill=255)
    data = np.array(source)
    wood = np.array(mask)
    for y in range(20, 465):
        row = data[y, :, :3].astype(int)
        brown = np.where((wood[y] > 0) & (data[y, :, 3] >= 128) &
                         (row[:, 0] > row[:, 1] + 12) & (row[:, 1] > row[:, 2] + 5))[0]
        if len(brown):
            wood[y, :max(0, int(brown.min()) - 1)] = 0
            wood[y, int(brown.max()) + 2:] = 0
    mask = Image.fromarray(wood)
    ImageDraw.Draw(mask).polygon([(458, 155), (480, 155), (496, 164), (510, 174),
        (514, 194), (507, 208), (490, 209), (475, 200), (458, 194), (454, 177)], fill=255)
    data[:, :, 3] = np.minimum(data[:, :, 3], np.array(mask))
    return Image.fromarray(data)


def moving_cloak(base, source, phase):
    """Animate cloth only: drawn folds and a small downward hem follow-through.

    Keep the hood/shoulder geometry anchored. Downward displacement at the
    lower edge avoids uncovering any undrawn fabric in the accepted leg layers.
    """
    data = np.array(base)
    drawn = np.array(source)
    yy, xx = np.indices(data.shape[:2])
    old_hsv = np.array(base.convert('RGB').convert('HSV'))
    src_hsv = np.array(source.convert('RGB').convert('HSV'))
    cloth = (src_hsv[:, :, 0] >= 29) & (src_hsv[:, :, 0] <= 110) & (src_hsv[:, :, 1] > 40)
    # Fold shadows must move too; a hue test alone leaves dotted remnants
    # of the old dark folds. Exclude brown legs at the drawn hem instead.
    cloth |= (src_hsv[:, :, 2] < 70) & (drawn[:, :, 1].astype(float) >= .9 * drawn[:, :, 0])
    old_cloth = (old_hsv[:, :, 0] >= 32) & (old_hsv[:, :, 0] <= 110) & (old_hsv[:, :, 1] > 40)
    old_cloth |= (old_hsv[:, :, 2] < 70) & (data[:, :, 1].astype(float) >= .9 * data[:, :, 0])
    cloth &= old_cloth  # preserve the original warm tan hem trim
    cloth &= (data[:, :, 3] > 0) & (drawn[:, :, 3] >= 128)
    interior = np.clip((distance_transform_edt(data[:, :, 3] > 0) - 5) / 7, 0, 1)
    blend = .8 * np.clip((yy - 112) / 28, 0, 1) * interior * cloth
    rgb = data[:, :, :3].astype(float)
    data[:, :, :3] = np.rint(rgb + (drawn[:, :, :3].astype(float) - rgb) * blend[:, :, None]).astype('uint8')
    colored = np.array(front['match_cloth'](Image.fromarray(data)))
    # Alternating weight follows the two steps; the center stays at the same
    # height in every phase. No X displacement or whole-character translation.
    left, right = CLOAK_HEM[phase]
    mix = .5 + .5 * np.tanh((xx - 128) / 30)
    weight = np.clip((yy - 150) / 55, 0, 1) ** 2
    # The right-arm patch ends at y=191; leave its attachment untouched.
    weight *= np.where(xx >= ARM_REGION[0], np.clip((yy - 194) / 11, 0, 1), 1)
    dy = (left * (1 - mix) + right * mix) * weight
    coords = np.array([yy - dy, xx])
    # Nearest sampling preserves the native pixel texture and binary alpha.
    return Image.fromarray(np.stack([map_coordinates(colored[:, :, channel], coords,
        order=0, mode='constant', cval=0) for channel in range(4)], axis=-1))


def corrected_bodies(original_body):
    """Anchored accepted torso with independent cloth, arm and leg layers.

    Never align the torso to a swinging boot. Each complete visible leg is
    translated horizontally once to its fixed walking lane, without stretching
    or changing the drawn hip/knee motion. The cloak occludes its upper root.
    """
    source = Image.open(OUT / 'walk-gait-source.png').convert('RGBA')
    arm_source = Image.open(OUT / 'walk-free-arm-source.png').convert('RGBA')
    cloak_source = Image.open(OUT / 'walk-cloak-motion-source.png').convert('RGBA')
    if source.size != (512, 640):
        raise ValueError('Gait source must contain four native 256x320 cells, 2x2.')
    if arm_source.size != (188, 79):
        raise ValueError('Arm source must contain four native 47x79 regions.')
    if cloak_source.size != (512, 640):
        raise ValueError('Cloak source must contain four native 256x320 cells, 2x2.')
    opening = Image.new('L', SIZE)
    ImageDraw.Draw(opening).polygon(LEG_OPENING, fill=255)
    data = np.array(original_body)
    data[np.array(opening) > 0] = 0
    left, top, right, bottom = ARM_REGION
    data[top:bottom, left:right] = 0
    cloak = Image.fromarray(data)
    frames, leg_frames, arm_frames, cloak_frames, registrations = [], [], [], [], []
    yy, _ = np.indices((SIZE[1], SIZE[0]))
    for i in range(4):
        x, y = (i % 2) * SIZE[0], (i // 2) * SIZE[1]
        data = np.array(source.crop((x, y, x + SIZE[0], y + SIZE[1])))
        data[:, :, 3] = np.where(data[:, :, 3] >= 128, 255, 0)
        drawn = front['match_cloth'](Image.fromarray(data))
        data = np.array(drawn)
        legs = Image.new('RGBA', SIZE)
        registration = []
        split = LEG_SPLITS[i]
        for (x0, x1), target in zip([(90, split), (split, 170)], BOOT_CENTERS):
            leg = np.zeros_like(data)
            leg[200:, x0:x1] = data[200:, x0:x1]
            alpha = leg[:, :, 3] > 0
            last = int(np.where(alpha)[0].max())
            # Bottom eight rows measure the boot sole, not the swinging thigh.
            sole_x = np.where(alpha & (yy >= last - 7))[1]
            center = int(np.rint(np.median(sole_x)))
            dx = target - center
            shifted = Image.new('RGBA', SIZE)
            shifted.paste(Image.fromarray(leg), (dx, 0))
            legs.alpha_composite(shifted)
            registration.append({'soleX': target, 'sourceSoleX': center, 'offsetX': dx,
                                 'lowestPixelY': last})
        # The arm region also restores the small piece of cloak behind the
        # changing elbow. It is a drawn patch, not an isolated floating hand.
        arm = Image.new('RGBA', SIZE)
        # Both neutral phases use one drawing. Foreshorten the leather
        # forearm by five pixels while keeping shoulder, cuff and fist size.
        # This puts the neutral hand between the forward/back endpoints.
        arm_index = 0 if i == 2 else i
        patch = arm_source.crop((47 * arm_index, 0, 47 * (arm_index + 1), 79))
        pixels = np.array(patch)
        pixels[:, :, 3] = np.where(pixels[:, :, 3] >= 128, 255, 0)
        patch = Image.fromarray(pixels)
        if i in (0, 2):
            projected = Image.new('RGBA', patch.size)
            projected.paste(patch.crop((0, 0, 47, 35)), (0, 0))
            projected.paste(patch.crop((0, 35, 47, 45)).resize((47, 5), Image.Resampling.NEAREST), (0, 35))
            projected.paste(patch.crop((0, 45, 47, 79)), (0, 40))
            py, px = np.indices((79, 47))
            for im, erase in [(patch, True), (projected, False)]:
                hsv = np.array(im.convert('RGB').convert('HSV'))
                values = np.array(im)
                green = (hsv[:, :, 0] >= 32) & (hsv[:, :, 0] <= 110) & (hsv[:, :, 1] > 55)
                limb = (values[:, :, 3] > 0) & ~green & (px >= 14) & (py >= 35)
                pixels[limb] = 0 if erase else values[limb]
            patch = Image.fromarray(pixels)
        # Discard tiny detached outline remnants from the shorter projected
        # forearm. Never erase pixels inside the connected limb or cloak.
        pixels = np.array(patch)
        components, _ = label(pixels[:, :, 3] > 0, np.ones((3, 3)))
        counts = np.bincount(components.ravel())
        tiny = np.flatnonzero((counts > 0) & (counts <= 3))
        tiny = tiny[tiny != 0]
        pixels[np.isin(components, tiny)] = 0
        patch = Image.fromarray(pixels)
        arm.paste(front['match_cloth'](patch), (left, top))
        cloth = moving_cloak(cloak, cloak_source.crop((x, y, x + SIZE[0], y + SIZE[1])), i)
        body = legs.copy()
        body.alpha_composite(cloth)
        body.alpha_composite(arm)
        frames.append(body)
        leg_frames.append(legs)
        arm_frames.append(arm)
        cloak_frames.append(cloth)
        registrations.append(registration)
    save(cloak, 'walk-fixed-cloak-256x320.png')
    save(front['strip'](cloak_frames), 'walk-cloak-motion-256x320.png')
    save(front['strip'](leg_frames), 'walk-legs-256x320.png')
    save(front['strip'](arm_frames), 'walk-right-arm-region-256x320.png')
    return frames, registrations


def main():
    source = Image.open(OUT / 'walk-source.png').convert('RGBA')
    bodies = poses(Image.open(OUT / 'walk-body-source.png').convert('RGBA'))
    original = poses(source)[0]
    scale = 280 / max(p['ground'] - p['top'] for p in bodies)
    first = bodies[0]
    fixed_body = front['opaque_body'](front['match_cloth'](
        front['render'](first['image'], first['anchorX'], first['ground'], scale)))
    body_frames, leg_registration = corrected_bodies(fixed_body)
    master = front['render'](staff_cutout(source), original['anchorX'], original['ground'], scale)
    planted_offset = BASELINE - master.getbbox()[3]
    frames, staff_frames = [], []
    for i, body in enumerate(body_frames):
        staff = Image.new('RGBA', SIZE)
        staff.paste(master, (0, planted_offset - LIFT[i]))
        # In rear view the cloak naturally occludes the shaft and arm root.
        frame = staff.copy()
        frame.alpha_composite(body)
        frames.append(frame)
        staff_frames.append(staff)
    save(front['strip'](body_frames), 'walk-body-256x320.png')
    save(front['strip'](staff_frames), 'walk-arm-staff-256x320.png')
    save(front['strip'](frames), 'walk-up-256x320.png')
    front['preview'](front['strip'](frames)).save(OUT / 'walk-up-frames-preview.png')
    palette = front['preview'](front['strip'](frames)).quantize(colors=256, dither=Image.Dither.NONE)
    gif_frames = [front['preview'](f).quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    gif_frames[0].save(OUT / 'walk-up-preview.gif', save_all=True, append_images=gif_frames[1:],
                       duration=FRAME_MS, loop=0, disposal=2, optimize=False)
    metadata = {'integrated': True, 'direction': 'up', 'frameWidth': 256, 'frameHeight': 320,
        'frameCount': 4, 'frameDurationMs': FRAME_MS, 'previewScale': 1, 'baselineY': BASELINE,
        'scale': scale, 'registration': 'anchored hood/torso; moving cloth and fixed vertical leg lanes',
        'gait': {'source': 'walk-gait-source.png', 'torsoFixed': True, 'torsoOffsetY': [0, 0, 0, 0],
                 'bootSoleCentersX': list(BOOT_CENTERS), 'legRegistration': leg_registration,
                 'rightArmRegion': list(ARM_REGION), 'armSource': 'walk-free-arm-source.png',
                 'neutralArmForearmForeshorteningPx': 5},
        'cloak': {'source': 'walk-cloak-motion-source.png', 'hoodAndShouldersAnchored': True,
                  'foldBlendStartsY': 112, 'maxHemFollowThroughPx': 2,
                  'hemLeftRightOffsets': [list(pair) for pair in CLOAK_HEM]},
        'anchors': [{k: v for k, v in p.items() if k != 'image'} for p in bodies],
        'staff': {'anatomicalHand': 'left', 'screenSide': 'left', 'rigidMaster': True,
                  'liftPixels': list(LIFT), 'plantedOffsetY': planted_offset,
                  'plantsPerCycle': 1, 'stepsPerCycle': 2},
        'sources': ['walk-source.png', 'walk-body-source.png', 'walk-gait-source.png',
                    'walk-free-arm-source.png', 'walk-cloak-motion-source.png'],
        'bodyLayersBackToFront': ['walk-legs-256x320.png', 'walk-cloak-motion-256x320.png',
                                  'walk-right-arm-region-256x320.png'],
        'layersBackToFront': ['walk-arm-staff-256x320.png', 'walk-body-256x320.png']}
    (OUT / 'art.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print('Accepted rear Basic 04: 4 × 256x320, 240 ms preview, one staff plant per two steps.')


if __name__ == '__main__':
    main()
