"""Keep the accepted v1 arm/staff gesture over one stationary body per view.

Only the hidden sleeve/staff area needs a repaired body plate. The new source
supplies that small patch, never a new head, torso, legs or entire character.
"""
import json
from pathlib import Path
import runpy

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_dilation, binary_fill_holes, label

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-cast-front-stable-v1'
base = runpy.run_path(str(ROOT / 'scripts/prepare-druid-cast-eight-way.py'))
old = base['old']; rgba, clean = base['rgba'], base['clean']
SIZE, OFFSET = base['SIZE'], base['OFFSET']
DIRECTIONS = ('down', 'down-left')
HEAD = ((122, 18), (145, 24), (166, 58), (177, 81), (164, 99),
        (136, 110), (111, 105), (91, 90), (82, 74), (87, 49), (103, 30))
ELBOWS = ((187, 120), (195, 100), (184, 118), (175, 119), (193, 109), (189, 132))


def polygon(points):
    mask = Image.new('1', (256, 320)); ImageDraw.Draw(mask).polygon(points, fill=1)
    return np.array(mask)


def stationary_body(direction, idle):
    if direction == 'down':
        # This old body plate preserves the approved standing figure outside
        # its local arm removal. Its rejected v2 gesture is NOT reused.
        body = rgba(ROOT / 'docs/art/druid-cast-down-v2/body-fixed-256x320.png')
        pixels = np.array(body)
        walk = rgba(ROOT / 'docs/art/druid-eight-way-v1/walk-down-256x320.png').crop((0, 0, 256, 320))
        mask = polygon(HEAD)
        pixels[mask] = np.array(walk)[mask]
        body = clean(Image.fromarray(pixels))
        Image.fromarray(mask.astype('uint8') * 255).save(OUT / 'head-down-mask.png', optimize=True)
        return body

    source = rgba(OUT / 'body-clean-source.png'); pixels = np.array(source)
    components, _ = label(pixels[:, :, 3] >= 128, np.ones((3, 3)))
    largest = np.argmax(np.bincount(components.ravel())[1:]) + 1
    foreground = components == largest
    yy, xx = np.indices(foreground.shape)
    top, bottom = yy[foreground].min(), yy[foreground].max() + 1
    hsv = np.array(source.convert('RGB').convert('HSV'))
    face = foreground & (yy > top + .1 * (bottom - top)) & (yy < top + .2 * (bottom - top))
    face &= (hsv[:, :, 0] <= 27) & (hsv[:, :, 1] >= 65) & (hsv[:, :, 2] >= 135)
    native = np.array(idle.convert('RGB').convert('HSV'))
    ny, nx = np.indices((320, 256))
    native_face = (ny > 50) & (ny < 80) & (nx > 90) & (nx < 150)
    native_face &= (native[:, :, 0] <= 27) & (native[:, :, 1] >= 65) & (native[:, :, 2] >= 135)
    face_x = float(np.median(nx[native_face]))
    scale = 277 / (bottom - top)
    pixels[~foreground] = 0
    repair = clean(Image.fromarray(pixels).transform((256, 320), Image.Transform.AFFINE,
        (1 / scale, 0, float(np.median(xx[face])) - face_x / scale,
         0, 1 / scale, bottom - 298 / scale), Image.Resampling.BICUBIC))
    repair = base['art']['palette_match']([repair])[0]
    removal = polygon(((158, 103), (176, 104), (189, 113), (204, 121),
                       (204, 139), (188, 148), (170, 138), (158, 126)))
    removal |= polygon(((185, 15), (223, 15), (221, 105), (204, 145),
                         (190, 195), (187, 272), (175, 273), (176, 227), (183, 156), (185, 110)))
    # Preserve the original boots, including their outlines next to the shaft.
    boots = polygon(((132, 235), (148, 234), (160, 248), (166, 250),
                      (179, 264), (179, 277), (157, 279), (131, 263)))
    removal &= ~boots
    envelope = polygon(((158, 97), (180, 108), (194, 137), (202, 166),
                         (209, 199), (205, 215), (194, 223), (173, 231), (153, 200), (150, 119)))
    original = np.array(idle); pixels = original.copy(); pixels[removal] = 0
    pixels[removal & envelope] = np.array(repair)[removal & envelope]
    assert np.array_equal(pixels[~removal], original[~removal])
    Image.fromarray(removal.astype('uint8') * 255).save(OUT / 'body-down-left-edit-mask.png', optimize=True)
    return clean(Image.fromarray(pixels))


def moving_arm(body, phase, grip, direction):
    """Extract the already drawn sleeve, bracer and fist, not the whole pose."""
    root = (166, 108) if direction == 'down' else (159, 108)
    elbow = np.array(ELBOWS[phase], dtype=float)
    if direction == 'down-left': elbow += (-5, -2)
    mask = Image.new('1', (256, 320)); draw = ImageDraw.Draw(mask)
    path = [root, tuple(elbow), tuple(grip)]
    draw.line(path, fill=1, width=24)
    for x, y in path: draw.ellipse((x - 12, y - 12, x + 12, y + 12), fill=1)
    selected = np.array(mask)
    pixels = np.array(body); hsv = np.array(body.convert('RGB').convert('HSV'))
    cloth = (hsv[:, :, 0] >= 32) & (hsv[:, :, 0] <= 110) & (hsv[:, :, 1] >= 40)
    selected &= (pixels[:, :, 3] > 0) & ~cloth
    yy, xx = np.indices((320, 256))
    selected &= ~((yy < 100) & (xx < 178))  # never take beard/face with a raised arm
    pixels[~selected] = 0
    regions, _ = label(selected, np.ones((3, 3)))
    main = np.argmax(np.bincount(regions.ravel())[1:]) + 1
    # Keep dark/olive shading enclosed by the sleeve contour. Colour alone
    # must not punch transparent pinholes in the original wrapped arm.
    selected = binary_fill_holes(binary_dilation(regions == main, iterations=2))
    selected &= np.array(mask) & (np.array(body)[:, :, 3] > 0)
    pixels = np.array(body); pixels[~selected] = 0
    return clean(Image.fromarray(pixels))


def main():
    OUT.mkdir(exist_ok=True)
    staff = rgba(ROOT / 'docs/art/druid-cast-down-v1/staff-master-256x320.png')
    metadata = {'integrated': True, 'frameWidth': 512, 'frameHeight': 384,
        'idleOffset': OFFSET, 'durationMs': 670, 'directions': {},
        'headDownSource': '../druid-eight-way-v1/walk-down-256x320.png, first pose',
        'previousAssets': 'all earlier PNG/GIF sources retained unchanged',
        'body': 'one constant plate per view, no width/scale/leg changes between phases'}
    for direction in DIRECTIONS:
        idle = rgba(ROOT / f'docs/art/druid-eight-way-v1/idle-{direction}-256x320.png')
        fixed = stationary_body(direction, idle)
        # At the boundary of two cutouts an opaque original cloak pixel may
        # be replaced by transparent source padding. Restore only those tiny
        # enclosed gaps from the standing PNG, never invent new fabric.
        pixels = np.array(fixed); original_pixels = np.array(idle)
        opaque = pixels[:, :, 3] > 0
        gaps = binary_fill_holes(opaque) & ~opaque & (original_pixels[:, :, 3] > 0)
        pixels[gaps] = original_pixels[gaps]
        regions, count = label(pixels[:, :, 3] > 0, np.ones((3, 3)))
        sizes = np.bincount(regions.ravel()); largest = np.argmax(sizes[1:]) + 1
        for component in range(1, count + 1):
            if component == largest: continue
            assert sizes[component] <= 3, (direction, 'Detached stationary part')
            fragment = regions == component
            pixels[fragment] = 0
            if direction == 'down-left':
                mask_path = OUT / 'body-down-left-edit-mask.png'
                edit_mask = np.array(Image.open(mask_path)) > 0
                edit_mask |= fragment
                Image.fromarray(edit_mask.astype('uint8') * 255).save(mask_path, optimize=True)
        fixed = clean(Image.fromarray(pixels))
        assert not np.any(binary_fill_holes(pixels[:, :, 3] > 0) & (pixels[:, :, 3] == 0)), (direction, 'Body pinhole')
        fixed.save(OUT / f'body-{direction}-fixed-256x320.png', optimize=True)
        bodies = old['body_frames']() if direction == 'down' else base['body_frames'](direction, idle)
        original = json.loads((old['OUT'] / 'art.json').read_text()) if direction == 'down' else \
            json.loads((base['OUT'] / 'art.json').read_text())['directions'][direction]
        grips = original['gripCenters']
        static = Image.new('RGBA', SIZE); static.paste(fixed, OFFSET)
        first = Image.new('RGBA', SIZE); first.paste(idle, OFFSET)
        # The front preview's rest head also uses the walking-down reference.
        if direction == 'down':
            pixels = np.array(idle); mask = polygon(HEAD)
            pixels[mask] = np.array(fixed)[mask]
            first = Image.new('RGBA', SIZE); first.paste(Image.fromarray(pixels), OFFSET)
        frames, arms, branches = [first], [], []
        for phase, body in enumerate(bodies):
            grip = np.array(grips[phase])
            arm = moving_arm(body, phase, grip, direction)
            arm.save(OUT / f'arm-{direction}-{phase:02d}-256x320.png', optimize=True)
            layer = Image.new('RGBA', SIZE); layer.paste(arm, OFFSET)
            branch = old['position_staff'](staff, grip, old['ANGLES'][phase])
            # The stationary shoulder overlaps the sleeve root so it emerges
            # from under the same cloak instead of lying on top of it.
            cover_pixels = np.array(fixed); yy, xx = np.indices((320, 256))
            root = (166, 108) if direction == 'down' else (159, 108)
            cover = ((xx - root[0]) ** 2 + (yy - root[1]) ** 2 < 17 ** 2) & (yy <= 118)
            # Include the cape's dark outline as well as green highlights;
            # a colour-keyed cover leaves a speckled sleeve/cape seam.
            cover &= cover_pixels[:, :, 3] > 0
            cover_pixels[~cover] = 0
            shoulder = Image.new('RGBA', SIZE); shoulder.paste(Image.fromarray(cover_pixels), OFFSET)
            _, hand_mask = (old['gripping_hand'](body, grip) if direction == 'down' else base['hand_for'](body, grip))
            palm_pixels = np.array(arm); palm_pixels[~hand_mask] = 0
            palm = Image.new('RGBA', SIZE); palm.paste(Image.fromarray(palm_pixels), OFFSET)
            frame = static.copy()
            for part in (layer, shoulder, branch, palm): frame.alpha_composite(part)
            frame = clean(frame)
            pixels = np.array(frame); regions, count = label(pixels[:, :, 3] > 0, np.ones((3, 3)))
            sizes = np.bincount(regions.ravel()); main = np.argmax(sizes[1:]) + 1
            for component in range(1, count + 1):
                if component != main:
                    assert sizes[component] <= 3, (direction, phase, 'Detached moving part', sizes[component])
                    pixels[regions == component] = 0
            frame = Image.fromarray(pixels)
            assert set(np.unique(pixels[:, :, 3])) <= {0, 255}
            x0, y0, x1, y1 = frame.getbbox()
            assert x0 > 0 and y0 > 0 and x1 < SIZE[0] and y1 < SIZE[1], (direction, phase, 'Clipped sprite')
            # Region containing both feet must be exactly the standing pose.
            assert np.array_equal(pixels[40 + 235:40 + 300, 128 + 60:128 + 170],
                                  np.array(idle)[235:300, 60:170]), (direction, phase, 'Legs changed')
            frames.append(frame); arms.append(layer); branches.append(branch)
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
        metadata['directions'][direction] = {'gripCenters': grips, 'staffAnglesDegrees': old['ANGLES'],
            'fixedBody': f'body-{direction}-fixed-256x320.png', 'staffHand': 'anatomical-left'}
        print(direction, 'fixed standing body and boots, six accepted arm/staff phases')
    (OUT / 'art.json').write_text(json.dumps(metadata, indent=2) + '\n')


if __name__ == '__main__': main()
