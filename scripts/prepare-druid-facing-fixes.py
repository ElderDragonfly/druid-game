"""Tighten the down-left cast silhouette and match only left-view wood RGB.

All input PNGs stay unchanged. No body rescaling or new drawings: reuse the
standing contour, accepted gesture layers and canonical staff colour samples.
"""
import json
from pathlib import Path
import runpy

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_fill_holes, label

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-facing-fixes-v1'
stable = runpy.run_path(str(ROOT / 'scripts/prepare-druid-stable-front-casts.py'))
base, old = stable['base'], stable['old']
rgba, clean = stable['rgba'], stable['clean']
SIZE, OFFSET = stable['SIZE'], stable['OFFSET']


def preview_strip(frames, name, durations):
    old['strip'](frames).save(OUT / f'{name}-512x384.png', optimize=True)
    contact = Image.new('RGBA', (SIZE[0] * 4, SIZE[1] * 2))
    for i, frame in enumerate(frames): contact.paste(frame, (i % 4 * SIZE[0], i // 4 * SIZE[1]))
    old['preview'](contact).save(OUT / f'{name}-keyframes.png', optimize=True)
    palette = old['preview'](contact).quantize(colors=256, dither=Image.Dither.NONE)
    gifs = [old['preview'](f).quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    gifs[0].save(OUT / f'{name}-preview.gif', save_all=True, append_images=gifs[1:],
                 duration=list(durations), loop=0, disposal=2, optimize=False)


def down_left():
    idle = rgba(ROOT / 'docs/art/druid-eight-way-v1/idle-down-left-256x320.png')
    pixels = np.array(rgba(stable['OUT'] / 'body-down-left-fixed-256x320.png'))
    silhouette = np.array(idle)[:, :, 3] > 0
    # The former hidden-cloth repair added 40 opaque pixels outside the idle
    # contour. Its shape must obey the standing silhouette, not the repair.
    removed = (pixels[:, :, 3] > 0) & ~silhouette
    pixels[~silhouette] = 0
    body = Image.fromarray(pixels)
    body.save(OUT / 'body-down-left-fixed-256x320.png', optimize=True)
    assert not np.any((pixels[:, :, 3] > 0) & ~silhouette)
    static = Image.new('RGBA', SIZE); static.paste(body, OFFSET)
    first = Image.new('RGBA', SIZE); first.paste(idle, OFFSET)
    staff = rgba(ROOT / 'docs/art/druid-cast-down-v1/staff-master-256x320.png')
    metadata = json.loads((stable['OUT'] / 'art.json').read_text())['directions']['down-left']
    frames, arm_layers = [first], []
    for phase, grip in enumerate(metadata['gripCenters']):
        source = rgba(stable['OUT'] / f'arm-down-left-{phase:02d}-256x320.png')
        data = np.array(source); hsv = np.array(source.convert('RGB').convert('HSV'))
        cloak = (hsv[:, :, 0] >= 32) & (hsv[:, :, 0] <= 110) & (hsv[:, :, 1] >= 40)
        regions, _ = label((data[:, :, 3] > 0) & ~cloak, np.ones((3, 3)))
        main = np.argmax(np.bincount(regions.ravel())[1:]) + 1
        # Preserve enclosed olive sleeve shadows, discard exterior cape
        # fragments which were carried along with the old wider arm drawing.
        selected = binary_fill_holes(regions == main) & (data[:, :, 3] > 0)
        data[~selected] = 0
        arm = Image.fromarray(data)
        layer = Image.new('RGBA', SIZE); layer.paste(arm, OFFSET)
        branch = old['position_staff'](staff, np.array(grip), metadata['staffAnglesDegrees'][phase])
        yy, xx = np.indices((320, 256)); shoulder_pixels = pixels.copy()
        shoulder = ((xx - 159) ** 2 + (yy - 108) ** 2 < 17 ** 2) & (yy <= 118)
        shoulder_pixels[~shoulder] = 0
        cover = Image.new('RGBA', SIZE); cover.paste(Image.fromarray(shoulder_pixels), OFFSET)
        _, palm_mask = base['hand_for'](arm, np.array(grip))
        data[~palm_mask] = 0
        palm = Image.new('RGBA', SIZE); palm.paste(Image.fromarray(data), OFFSET)
        frame = static.copy()
        for part in (layer, cover, branch, palm): frame.alpha_composite(part)
        data = np.array(frame); regions, count = label(data[:, :, 3] > 0, np.ones((3, 3)))
        sizes = np.bincount(regions.ravel()); largest = np.argmax(sizes[1:]) + 1
        for component in range(1, count + 1):
            if component == largest: continue
            assert sizes[component] <= 3, (phase, 'Detached limb', sizes[component])
            data[regions == component] = 0
        frame = Image.fromarray(data)
        assert np.array_equal(data[275:340, 188:298], np.array(idle)[235:300, 60:170])
        assert set(np.unique(data[:, :, 3])) <= {0, 255}
        x0, y0, x1, y1 = frame.getbbox()
        assert x0 > 0 and y0 > 0 and x1 < SIZE[0] and y1 < SIZE[1]
        frames.append(frame); arm_layers.append(layer)
    frames.append(first.copy())
    preview_strip(frames, 'cast-down-left', old['DURATIONS'])
    old['strip'](arm_layers).save(OUT / 'arm-down-left-poses-512x384.png', optimize=True)
    return {'trimmedBodyPixels': int(removed.sum()), 'bodyWithinIdleContour': True,
            'gesture': metadata, 'previous': '../druid-cast-front-stable-v1/cast-down-left-512x384.png'}


def left_wood():
    original_idle = rgba(ROOT / 'docs/art/druid-eight-way-v1/idle-left-256x320.png')
    original_walk = rgba(ROOT / 'docs/art/druid-eight-way-v1/walk-left-256x320.png')
    walk_parts = rgba(ROOT / 'docs/art/druid-side-refinement-v1/walk-left-arm-staff-256x320.png')
    idle = np.array(original_idle); walk = np.array(original_walk)
    yy, xx = np.indices((320, 256))
    # Explicit wood silhouette in idle, excluding the fist, bracer and boots.
    mask = Image.new('1', (256, 320)); draw = ImageDraw.Draw(mask)
    draw.polygon(((59, 19), (84, 20), (88, 43), (77, 70), (84, 95), (86, 113),
                  (74, 116), (65, 93), (62, 82), (52, 72), (43, 52), (46, 37), (57, 44)), fill=1)
    draw.polygon(((76, 140), (88, 141), (92, 178), (98, 206), (104, 263), (105, 285),
                  (94, 286), (90, 266), (87, 229), (84, 204), (78, 177)), fill=1)
    idle_mask = np.array(mask) & (idle[:, :, 3] > 0)
    parts = np.array(walk_parts); walk_mask = np.zeros(walk.shape[:2], dtype=bool)
    for i in range(4):
        layer = parts[:, i * 256:(i + 1) * 256]
        hsv = np.array(Image.fromarray(layer).convert('RGB').convert('HSV'))
        skin = (layer[:, :, 3] > 0) & (yy >= 100) & (yy <= 155) & (xx > 60) & (xx < 115)
        skin &= (hsv[:, :, 0] <= 27) & (hsv[:, :, 1] >= 65) & (hsv[:, :, 2] >= 150)
        regions, _ = label(skin, np.ones((3, 3)))
        largest = np.argmax(np.bincount(regions.ravel())[1:]) + 1
        hand_y = yy[regions == largest]
        wood = (layer[:, :, 3] > 0) & (xx < 110)
        wood &= (yy < hand_y.min() - 3) | (yy > hand_y.max() + 3)
        # Match the composited source too: covered layer pixels are not wood
        # visible in the final PNG (a boot or the foreground sleeve may cover it).
        current = walk[:, i * 256:(i + 1) * 256]
        wood &= np.all(current[:, :, :3] == layer[:, :, :3], axis=2)
        walk_mask[:, i * 256:(i + 1) * 256] = wood
    staff = np.array(rgba(ROOT / 'docs/art/druid-cast-down-v1/staff-master-256x320.png'))
    reference = staff[:, :, :3][staff[:, :, 3] > 0]
    selected = np.concatenate((idle[:, :, :3][idle_mask], walk[:, :, :3][walk_mask]))
    luminance = lambda colors: colors.astype(float) @ np.array((.2126, .7152, .0722))
    values, counts = np.unique(selected, axis=0, return_counts=True)
    order = np.argsort(luminance(values)); values, counts = values[order], counts[order]
    quantiles = (np.cumsum(counts) - counts / 2) / counts.sum()
    ref_order = reference[np.argsort(luminance(reference))]
    # One shared RGB lookup for idle and all four walking poses. Reference
    # colours are taken from the same actual wood used by every cast.
    indices = np.minimum((quantiles * len(ref_order)).astype(int), len(ref_order) - 1)
    colours = ref_order[indices]
    packed = lambda colors: colors[:, 0].astype('uint32') * 65536 + colors[:, 1].astype('uint32') * 256 + colors[:, 2]
    keys = packed(values); order = np.argsort(keys); keys, colours = keys[order], colours[order]
    for name, pixels, selected_mask in [('idle-left', idle, idle_mask), ('walk-left', walk, walk_mask)]:
        source = pixels.copy()
        pixels[:, :, :3][selected_mask] = colours[np.searchsorted(keys, packed(pixels[:, :, :3][selected_mask]))]
        assert np.array_equal(source[:, :, 3], pixels[:, :, 3]), 'Changed silhouette'
        assert np.array_equal(source[~selected_mask], pixels[~selected_mask]), 'Recoloured non-wood'
        Image.fromarray(pixels).save(OUT / f'{name}-256x320.png', optimize=True)
        Image.fromarray(selected_mask.astype('uint8') * 255).save(OUT / f'{name}-wood-mask.png', optimize=True)
    return {'reference': '../druid-cast-down-v1/staff-master-256x320.png',
            'idleWoodPixels': int(idle_mask.sum()), 'walkWoodPixels': int(walk_mask.sum()),
            'alphaAndNonWood': 'byte-identical to original; one shared wood RGB lookup'}


def main():
    OUT.mkdir(exist_ok=True)
    cast = down_left(); wood = left_wood()
    (OUT / 'art.json').write_text(json.dumps({'integrated': True, 'downLeft': cast, 'leftWood': wood}, indent=2) + '\n')
    print('Down-left contour:', cast['trimmedBodyPixels'], 'extra body pixels removed')
    print('Left staff:', wood)


if __name__ == '__main__': main()
