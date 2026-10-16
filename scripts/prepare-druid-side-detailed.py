"""Detailed Basic 04 profile walk proposals, separate from runtime art."""
import json
from pathlib import Path
import runpy

import numpy as np
from PIL import Image
from scipy.ndimage import label

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-side-refinement-v1'
SIZE = (256, 320)
HEAD_Y = 20
BASELINE = 300
FRAME_MS = 240
LIFT = (0, 6, 12, 6)
front = runpy.run_path(str(ROOT / 'scripts/prepare-druid-front-detailed.py'))


def save(image, name):
    data = np.array(image)
    data[data[:, :, 3] == 0] = 0
    Image.fromarray(data).save(OUT / name, optimize=True)


def poses(image):
    rgba = np.array(image)
    components, _ = label(rgba[:, :, 3] >= 128, np.ones((3, 3)))
    counts = np.bincount(components.ravel())
    ids = np.argsort(counts[1:])[-8:] + 1
    ids = sorted(ids, key=lambda k: (np.where(components == k)[0].min() > image.height / 2,
                                    np.where(components == k)[1].min()))
    yy, xx = np.indices(components.shape)
    hsv = np.array(image.convert('RGB').convert('HSV'))
    result = []
    for i, component in enumerate(ids):
        y, _ = np.where(components == component)
        top, ground = int(y.min()), int(y.max() + 1)
        hint = (i % 4) * image.width / 4 + image.width / 8
        hood = (components == component) & (yy < top + .16 * (ground - top)) & (abs(xx - hint) < 95)
        hood &= (hsv[:, :, 0] >= 32) & (hsv[:, :, 0] <= 110) & (hsv[:, :, 1] > 40)
        anchor = float(np.median(xx[hood]))
        data = rgba.copy()
        data[:, :, 3] = np.where(components == component, data[:, :, 3], 0)
        result.append({'image': Image.fromarray(data), 'top': top, 'ground': ground, 'anchorX': anchor})
    return result


def render_at_head(image, anchor, top, scale):
    """Use hood coordinates, never the changing width/position of the feet."""
    frame = image.transform(SIZE, Image.Transform.AFFINE,
        (1 / scale, 0, anchor - SIZE[0] / 2 / scale,
         0, 1 / scale, top - HEAD_Y / scale), Image.Resampling.BICUBIC)
    data = np.array(frame)
    data[:, :, 3] = np.where(data[:, :, 3] >= 128, 255, 0)
    return Image.fromarray(data)


def main():
    originals = poses(Image.open(OUT / 'walk-source.png').convert('RGBA'))
    bodies = poses(Image.open(OUT / 'walk-body-source.png').convert('RGBA'))
    arm_source = Image.open(OUT / 'arm-staff-source.png').convert('RGBA')
    if arm_source.size != (768, 512):
        raise ValueError('Arm/staff source must contain two original 384x512 cells.')
    groups, info = {}, {}
    for row, direction in enumerate(('left', 'right')):
        row_bodies = bodies[row * 4:row * 4 + 4]
        scale = 280 / max(p['ground'] - p['top'] for p in row_bodies)
        body_frames = [front['opaque_body'](front['match_cloth'](
            render_at_head(p['image'], p['anchorX'], p['top'], scale))) for p in row_bodies]
        # Same detailed head/hood in all four phases: no facial morph or bob.
        head = body_frames[0].crop((0, 0, SIZE[0], 100))
        for body in body_frames:
            body.paste(head, (0, 0))
        first = originals[row * 4]
        piece = Image.new('RGBA', arm_source.size)
        cell_x = row * 384
        piece.paste(arm_source.crop((cell_x, 0, cell_x + 384, 512)), (cell_x, 0))
        # The second extraction cell comes from original row two, column one.
        anchor = first['anchorX'] + cell_x
        top = first['top'] - row * 512
        master = render_at_head(piece, anchor, top, scale)
        planted_offset = BASELINE - master.getbbox()[3]
        frames, staff_frames, foreground_frames = [], [], []
        forward = -1 if direction == 'left' else 1
        for i, body in enumerate(body_frames):
            staff = Image.new('RGBA', SIZE)
            staff.paste(master, (forward * (0, 3, 6, 3)[i], planted_offset - LIFT[i]))
            foreground = Image.new('RGBA', SIZE)
            if direction == 'left':
                # Near left forearm emerges underneath the cloak's shoulder.
                data = np.array(body)
                hsv = np.array(body.convert('RGB').convert('HSV'))
                yy, xx = np.indices(data.shape[:2])
                root = (xx >= 134) & (yy >= 100) & (yy < 155)
                root &= (hsv[:, :, 0] >= 32) & (hsv[:, :, 0] <= 110) & (hsv[:, :, 1] > 40)
                data[:, :, 3][~root] = 0
                foreground = Image.fromarray(data)
                frame = body.copy()
                frame.alpha_composite(staff)
                frame.alpha_composite(foreground)
            else:
                # Left hand is far, visible right arm is free and swings.
                frame = staff.copy()
                frame.alpha_composite(body)
            frames.append(frame)
            staff_frames.append(staff)
            foreground_frames.append(foreground)
        save(front['strip'](body_frames), f'walk-{direction}-body-256x320.png')
        save(front['strip'](staff_frames), f'walk-{direction}-arm-staff-256x320.png')
        if direction == 'left':
            save(front['strip'](foreground_frames), 'walk-left-cloak-foreground-256x320.png')
        save(front['strip'](frames), f'walk-{direction}-256x320.png')
        front['preview'](front['strip'](frames)).save(OUT / f'walk-{direction}-frames-preview.png')
        groups[direction] = frames
        info[direction] = {'scale': scale, 'hoodY': HEAD_Y,
            'anchors': [{k: v for k, v in p.items() if k != 'image'} for p in row_bodies],
            'staff': {'anatomicalHand': 'left', 'near': direction == 'left',
                      'rigidMaster': True, 'liftPixels': list(LIFT), 'plantedOffsetY': planted_offset,
                      'carryX': [forward * x for x in (0, 3, 6, 3)],
                      'plantsPerCycle': 1, 'stepsPerCycle': 2},
            'layerOrder': ['body', 'arm-staff', 'cloak-foreground'] if direction == 'left' else ['arm-staff', 'body']}
    # Shared palette makes direct left/right comparison use the same colors.
    all_frames = groups['left'] + groups['right']
    palette = front['preview'](front['strip'](all_frames)).quantize(colors=256, dither=Image.Dither.NONE)
    for direction, frames in groups.items():
        gif_frames = [front['preview'](f).quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
        gif_frames[0].save(OUT / f'walk-{direction}-preview.gif', save_all=True, append_images=gif_frames[1:],
            duration=FRAME_MS, loop=0, disposal=2, optimize=False)
    metadata = {'integrated': False, 'frameWidth': 256, 'frameHeight': 320, 'frameCount': 4,
        'frameDurationMs': FRAME_MS, 'previewScale': 1, 'baselineY': BASELINE,
        'registration': 'fixed hood, independent of feet; common head in each direction',
        'sources': ['walk-source.png', 'walk-body-source.png', 'arm-staff-source.png'], 'directions': info}
    (OUT / 'art.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print('Side Basic 04 proposals: left and right, 4 x 256x320, 240 ms; not integrated.')


if __name__ == '__main__':
    main()
