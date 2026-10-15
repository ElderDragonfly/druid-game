"""Separate detailed Basic 04 rear walk proposal; never changes runtime art."""
import json
from pathlib import Path
import runpy

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import label

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-back-refinement-v1'
SIZE = (256, 320)
BASELINE = 300
LIFT = (0, 6, 12, 6)
FRAME_MS = 240
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


def main():
    source = Image.open(OUT / 'walk-source.png').convert('RGBA')
    bodies = poses(Image.open(OUT / 'walk-body-source.png').convert('RGBA'))
    original = poses(source)[0]
    scale = 280 / max(p['ground'] - p['top'] for p in bodies)
    body_frames = [front['opaque_body'](front['match_cloth'](
        front['render'](p['image'], p['anchorX'], p['ground'], scale))) for p in bodies]
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
    metadata = {'integrated': False, 'direction': 'up', 'frameWidth': 256, 'frameHeight': 320,
        'frameCount': 4, 'frameDurationMs': FRAME_MS, 'previewScale': 1, 'baselineY': BASELINE,
        'scale': scale, 'registration': 'hood center, independent of feet and staff',
        'anchors': [{k: v for k, v in p.items() if k != 'image'} for p in bodies],
        'staff': {'anatomicalHand': 'left', 'screenSide': 'left', 'rigidMaster': True,
                  'liftPixels': list(LIFT), 'plantedOffsetY': planted_offset,
                  'plantsPerCycle': 1, 'stepsPerCycle': 2},
        'sources': ['walk-source.png', 'walk-body-source.png'],
        'layersBackToFront': ['walk-arm-staff-256x320.png', 'walk-body-256x320.png']}
    (OUT / 'art.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print('Rear Basic 04 proposal: 4 × 256x320, 240 ms, one staff plant per two steps; not integrated.')


if __name__ == '__main__':
    main()
