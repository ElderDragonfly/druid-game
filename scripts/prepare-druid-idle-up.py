"""Standing rear pose: new planted legs under the accepted walk's unchanged layers."""
from pathlib import Path
import runpy

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-back-refinement-v1'
SIZE = (256, 320)
BASELINE = 300
front = runpy.run_path(str(ROOT / 'scripts/prepare-druid-front-detailed.py'))


def first(name):
    return Image.open(OUT / name).convert('RGBA').crop((0, 0, *SIZE))


def main():
    # Redraw only supplies resting legs. Retain every accepted cloak, head,
    # hand and staff pixel rather than replacing the character with a new one.
    source = Image.open(OUT / 'idle-up-source.png').convert('RGBA')
    pixels = np.array(source)
    yy, xx = np.indices(pixels.shape[:2])
    opaque = pixels[:, :, 3] >= 128
    top, bottom = np.where(opaque)[0].min(), np.where(opaque)[0].max() + 1
    scale = 276 / (bottom - top)
    pixels[yy < 900] = 0
    pixels[(xx < 390) | (xx >= 750)] = 0
    legs_source = Image.fromarray(pixels).transform(SIZE, Image.Transform.AFFINE,
        (1 / scale, 0, 560 - 128 / scale, 0, 1 / scale, top - 24 / scale),
        Image.Resampling.BICUBIC)
    pixels = np.array(legs_source)
    pixels[:, :, 3] = np.where(pixels[:, :, 3] >= 128, 255, 0)
    pixels = np.array(front['match_cloth'](Image.fromarray(pixels)))
    legs = Image.new('RGBA', SIZE)
    yy, _ = np.indices((320, 256))
    for (start, end), center in zip(((85, 134), (134, 180)), (115, 147)):
        data = np.zeros_like(pixels)
        data[:, start:end] = pixels[:, start:end]
        alpha = data[:, :, 3] > 0
        last = np.where(alpha)[0].max()
        sole_x = int(np.rint(np.median(np.where(alpha & (yy >= last - 5))[1])))
        shifted = Image.new('RGBA', SIZE)
        shifted.paste(Image.fromarray(data), (center - sole_x, BASELINE - 1 - int(last)))
        legs.alpha_composite(shifted)
    frame = first('walk-arm-staff-256x320.png')
    frame.alpha_composite(legs)
    frame.alpha_composite(first('walk-cloak-motion-256x320.png'))
    frame.alpha_composite(first('walk-right-arm-region-256x320.png'))
    for name, image in [('idle-up-legs-256x320.png', legs), ('idle-up-256x320.png', frame)]:
        data = np.array(image)
        data[data[:, :, 3] == 0] = 0
        Image.fromarray(data).save(OUT / name, optimize=True)
    front['preview'](frame).save(OUT / 'idle-up-preview.png', optimize=True)
    print('Idle up: both boots planted at y=300; accepted upper body and staff unchanged.')


if __name__ == '__main__':
    main()
