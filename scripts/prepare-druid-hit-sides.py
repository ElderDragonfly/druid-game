"""Register newly drawn side flinches, restore planted boots and assemble PNG/GIF.

Original idle art stays untouched. Drawing is in source-poses.png; this script
only isolates cells, registers scale/feet, matches existing RGB and packs frames.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import label, binary_fill_holes
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-hit-side-v1'
SOURCE = OUT / 'source-poses.png'
DURATIONS = [40, 70, 120, 100, 70]
SIZE, OFFSET = (512, 384), (128, 40)
IDLES = {'left': ROOT / 'docs/art/druid-facing-fixes-v1/idle-left-256x320.png',
         'right': ROOT / 'docs/art/druid-eight-way-v1/idle-right-256x320.png'}


def clean(image):
    a = np.array(image)
    opaque = a[:, :, 3] >= 180
    components, count = label(opaque, np.ones((3, 3)))
    sizes = np.bincount(components.ravel()); sizes[0] = 0
    opaque = components == sizes.argmax()
    # Fill tiny enclosed alpha pinholes, never the exterior silhouette.
    holes = binary_fill_holes(opaque) & ~opaque
    hole_labels, _ = label(holes)
    hole_sizes = np.bincount(hole_labels.ravel())
    opaque |= holes & (hole_sizes[hole_labels] <= 3)
    a[:, :, 3] = opaque * 255; a[~opaque] = 0
    return Image.fromarray(a)


def foot_anchor(image):
    a = np.array(image); hsv = np.array(image.convert('RGB').convert('HSV'))
    yy, _ = np.indices(a.shape[:2])
    bottom = np.where(a[:, :, 3] > 0)[0].max()
    boots = (a[:, :, 3] > 0) & (yy > bottom - 12) & (hsv[:, :, 0] < 32)
    ys, xs = np.where(boots)
    return float(np.mean(xs)), int(ys.max())


def padded(image):
    frame = Image.new('RGBA', SIZE); frame.paste(image, OFFSET); return frame


def preview(image):
    bg = Image.new('RGBA', image.size, (38, 54, 40, 255)); bg.alpha_composite(image); return bg.convert('RGB')


source = Image.open(SOURCE).convert('RGBA')
metadata = {'source': str(SOURCE.relative_to(ROOT)), 'frameWidth': 512, 'frameHeight': 384,
            'offset': list(OFFSET), 'durationsMs': DURATIONS, 'directions': {}}
for row, (direction, path) in enumerate(IDLES.items()):
    idle = Image.open(path).convert('RGBA'); native = np.array(idle); opaque = native[:, :, 3] > 0
    anchor_x, anchor_y = foot_anchor(idle)
    cells = [clean(source.crop((round(col * source.width / 3), round(row * source.height / 2),
                                round((col + 1) * source.width / 3), round((row + 1) * source.height / 2))))
             for col in range(3)]
    original_box, drawn_box = idle.getbbox(), cells[0].getbbox()
    # A single registration scale per row, shared by all poses, avoids size pumping.
    sx = (original_box[2] - original_box[0]) / (drawn_box[2] - drawn_box[0])
    sy = (original_box[3] - original_box[1]) / (drawn_box[3] - drawn_box[1])
    palette = np.unique(native[:, :, :3][opaque], axis=0)
    colors = cKDTree(palette.astype(float))
    native_hsv = np.array(idle.convert('RGB').convert('HSV'))
    yy, xx = np.indices((320, 256))
    boot_region = ((yy >= 254) & (xx > 107) & (xx < 185)) if direction == 'left' else ((yy >= 272) & (xx > 90) & (xx < 165))
    boots = opaque & boot_region & (native_hsv[:, :, 0] < 32)
    Image.fromarray((boots * 255).astype('uint8')).save(OUT / f'boot-mask-{direction}.png')
    frames = [padded(idle)]
    for pose in cells:
        pose = pose.resize((round(pose.width * sx), round(pose.height * sy)), Image.Resampling.NEAREST)
        px, py = foot_anchor(pose)
        registered = Image.new('RGBA', (256, 320))
        registered.paste(pose, (round(anchor_x - px), anchor_y - py))
        data = np.array(registered); mask = data[:, :, 3] > 0
        _, nearest = colors.query(data[:, :, :3][mask].astype(float))
        data[:, :, :3][mask] = palette[nearest]
        hsv = np.array(Image.fromarray(data).convert('RGB').convert('HSV'))
        # Boot-only replacement: the bent cloak and trousers above remain drawn.
        drawn_boots = mask & boot_region & (hsv[:, :, 0] < 32)
        data[drawn_boots] = 0; data[boots] = native[boots]
        data[:, :, 3] = np.where(data[:, :, 3] > 0, 255, 0)
        data[data[:, :, 3] == 0] = 0
        image = Image.fromarray(data)
        # Stable planted soles, exact original palette and binary transparency.
        assert np.array_equal(data[boots], native[boots])
        assert set(np.unique(data[:, :, 3])).issubset({0, 255})
        frames.append(padded(image))
    frames.append(padded(idle))
    strip = Image.new('RGBA', (SIZE[0] * len(frames), SIZE[1]))
    for index, frame in enumerate(frames): strip.paste(frame, (index * SIZE[0], 0))
    strip.save(OUT / f'hit-{direction}-512x384.png', optimize=True)
    preview(strip).save(OUT / f'hit-{direction}-keyframes.png', optimize=True)
    palette_image = preview(strip).quantize(colors=256, dither=Image.Dither.NONE)
    gifs = [preview(frame).quantize(palette=palette_image, dither=Image.Dither.NONE) for frame in frames]
    gifs[0].save(OUT / f'hit-{direction}-preview.gif', save_all=True, append_images=gifs[1:],
                 duration=[350, 70, 120, 100, 500], loop=0, disposal=2, optimize=False)
    metadata['directions'][direction] = {'idle': str(path.relative_to(ROOT)), 'registrationScale': [sx, sy],
                                         'anchor': [anchor_x, anchor_y], 'bootPixelsPreserved': int(boots.sum())}
(OUT / 'art.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
