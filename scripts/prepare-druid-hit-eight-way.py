"""Pack six newly drawn hit views; accepted left/right art is never rewritten.

Source sheets contain separately drawn poses. Processing registers feet, uses
one scale per view, matches idle RGB and restores the original planted soles.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import label, binary_fill_holes
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/druid-hit-eight-way-v1'
GROUPS = {'front-back': ('down', 'up'), 'front-diagonals': ('down-left', 'down-right'),
          'rear-diagonals': ('up-left', 'up-right')}
DURATIONS = [40, 70, 120, 100, 70]
SIZE, OFFSET = (512, 384), (128, 40)
# Soles/ankles only: exclude the adjacent wooden shaft and moving cloak.
BOOT_REGIONS = {'down': (70, 183, 272), 'up': (76, 181, 272),
                'down-left': (65, 183, 273), 'down-right': (72, 181, 273),
                'up-left': (85, 191, 276), 'up-right': (68, 190, 278)}


def clean(image):
    a = np.array(image); opaque = a[:, :, 3] >= 180
    components, _ = label(opaque, np.ones((3, 3)))
    sizes = np.bincount(components.ravel()); sizes[0] = 0
    opaque = components == sizes.argmax()
    holes = binary_fill_holes(opaque) & ~opaque
    labels, _ = label(holes); sizes = np.bincount(labels.ravel())
    opaque |= holes & (sizes[labels] <= 3)
    a[:, :, 3] = opaque * 255; a[~opaque] = 0
    return Image.fromarray(a)


def foot_anchor(image):
    data = np.array(image); hsv = np.array(image.convert('RGB').convert('HSV'))
    yy, _ = np.indices(data.shape[:2]); bottom = np.where(data[:, :, 3] > 0)[0].max()
    mask = (data[:, :, 3] > 0) & (yy > bottom - 70) & (hsv[:, :, 0] < 32)
    labels, count = label(mask, np.ones((3, 3)))
    keep = np.zeros(mask.shape, dtype=bool)
    for component in range(1, count + 1):
        ys, xs = np.where(labels == component)
        if len(xs) >= 60 and xs.max() - xs.min() >= 12: keep |= labels == component
    ys, xs = np.where(keep)
    assert len(xs), 'No foot anchor'
    return float(np.mean(xs)), int(ys.max())


def stance_landmarks(data, y, staff_left):
    row = data[y]; xs = np.flatnonzero(row[:, 3] > 0)
    if not len(xs): return np.array([0, 64, 128, 192, 255], dtype=float)
    hsv = np.array(Image.fromarray(data).convert('RGB').convert('HSV'))[y]
    wood = (row[:, 3] > 0) & (hsv[:, 0] < 32)
    edges = np.diff(np.pad(wood.astype(int), (1, 1)))
    runs = [(a, b) for a, b in zip(np.where(edges == 1)[0], np.where(edges == -1)[0]) if 3 <= b - a <= 18]
    middle = np.median(xs)
    runs = [(a, b) for a, b in runs if (a + b) / 2 < middle] if staff_left else [(a, b) for a, b in runs if (a + b) / 2 > middle]
    branch = ((runs[0][0] + runs[0][1]) / 2 if staff_left else (runs[-1][0] + runs[-1][1]) / 2) if runs else (xs.min() if staff_left else xs.max())
    body = xs[np.abs(xs - branch) > 13]
    center = np.median(body) if len(body) else middle
    if staff_left: points = [0, branch, center, max(xs.max(), center + 1), 255]
    else: points = [0, min(xs.min(), center - 1), center, branch, 255]
    points = np.array(points, dtype=float)
    # Anatomical ordering is fixed, including rows where the branch is briefly hidden.
    for i in range(1, 4): points[i] = max(points[i], points[i - 1] + 1)
    points[3] = min(points[3], 254)
    return points


def register_lower_stance(data, native, direction):
    result = data.copy(); staff_left = direction in ('up', 'up-left')
    grid = np.arange(256)
    old = np.median([stance_landmarks(native, y, staff_left) for y in range(180, 231, 5)], axis=0)
    new = np.median([stance_landmarks(data, y, staff_left) for y in range(180, 231, 5)], axis=0)
    for y in range(185, 246):
        t = (y - 185) / 60; t = t * t * (3 - 2 * t)
        destination = new * (1 - t) + old * t
        samples = np.clip(np.rint(np.interp(grid, destination, new)).astype(int), 0, 255)
        row = data[y, samples].astype(float); target = native[y].astype(float)
        a = row[:, 3:4] / 255 * (1 - t); b = target[:, 3:4] / 255 * t
        alpha = a + b
        result[y, :, :3] = np.rint((row[:, :3] * a + target[:, :3] * b) / np.maximum(alpha, .0001)).astype('uint8')
        result[y, :, 3] = (alpha[:, 0] >= .5) * 255
    result[246:] = native[246:]
    result[result[:, :, 3] == 0] = 0
    return result


def padded(image):
    frame = Image.new('RGBA', SIZE); frame.paste(image, OFFSET); return frame


def preview(image):
    bg = Image.new('RGBA', image.size, (38, 54, 40, 255)); bg.alpha_composite(image); return bg.convert('RGB')


def main():
    OUT.mkdir(exist_ok=True)
    meta = {'frameWidth': 512, 'frameHeight': 384, 'offset': list(OFFSET), 'durationsMs': DURATIONS, 'fixedLowerRowsFrom': 246, 'stanceTransitionRows': [185, 245], 'directions': {}}
    for group, directions in GROUPS.items():
        source_path = OUT / f'source-{group}.png'
        source = Image.open(source_path).convert('RGBA')
        for row, direction in enumerate(directions):
            idle_path = ROOT / f'docs/art/druid-eight-way-v1/idle-{direction}-256x320.png'
            idle = Image.open(idle_path).convert('RGBA'); native = np.array(idle); opaque = native[:, :, 3] > 0
            ax, ay = foot_anchor(idle)
            cells = [clean(source.crop((round(col * source.width / 3), round(row * source.height / 2),
                         round((col + 1) * source.width / 3), round((row + 1) * source.height / 2)))) for col in range(3)]
            if direction == 'down-left':
                corrected = Image.open(OUT / 'source-front-diagonals-corrected.png').convert('RGBA')
                cells[1] = clean(corrected.crop((round(corrected.width / 3), 0,
                                                round(2 * corrected.width / 3), round(corrected.height / 2))))
            original_box, drawn_box = idle.getbbox(), cells[0].getbbox()
            sx = (original_box[2] - original_box[0]) / (drawn_box[2] - drawn_box[0])
            sy = (original_box[3] - original_box[1]) / (drawn_box[3] - drawn_box[1])
            palette = np.unique(native[:, :, :3][opaque], axis=0); colors = cKDTree(palette.astype(float))
            hsv = np.array(idle.convert('RGB').convert('HSV')); yy, xx = np.indices((320, 256))
            x0, x1, y0 = BOOT_REGIONS[direction]
            region = (xx >= x0) & (xx < x1) & (yy >= y0)
            boots = opaque & region & (hsv[:, :, 0] < 32)
            Image.fromarray((boots * 255).astype('uint8')).save(OUT / f'boot-mask-{direction}.png')
            frames = [padded(idle)]
            for pose in cells:
                pose = pose.resize((round(pose.width * sx), round(pose.height * sy)), Image.Resampling.NEAREST)
                px, py = foot_anchor(pose)
                registered = Image.new('RGBA', (256, 320)); registered.paste(pose, (round(ax - px), ay - py))
                data = np.array(registered); mask = data[:, :, 3] > 0
                _, nearest = colors.query(data[:, :, :3][mask].astype(float)); data[:, :, :3][mask] = palette[nearest]
                hsv = np.array(Image.fromarray(data).convert('RGB').convert('HSV'))
                data = register_lower_stance(data, native, direction)
                mask = data[:, :, 3] > 0
                _, nearest = colors.query(data[:, :, :3][mask].astype(float)); data[:, :, :3][mask] = palette[nearest]
                assert np.array_equal(data[246:], native[246:])
                assert np.array_equal(data[boots], native[boots])
                frames.append(padded(Image.fromarray(data)))
            frames.append(padded(idle))
            strip = Image.new('RGBA', (SIZE[0] * len(frames), SIZE[1]))
            for i, frame in enumerate(frames): strip.paste(frame, (i * SIZE[0], 0))
            strip.save(OUT / f'hit-{direction}-512x384.png', optimize=True)
            preview(strip).save(OUT / f'hit-{direction}-keyframes.png', optimize=True)
            palette_image = preview(strip).quantize(colors=256, dither=Image.Dither.NONE)
            gifs = [preview(frame).quantize(palette=palette_image, dither=Image.Dither.NONE) for frame in frames]
            gifs[0].save(OUT / f'hit-{direction}-preview.gif', save_all=True, append_images=gifs[1:],
                         duration=[350, 70, 120, 100, 500], loop=0, disposal=2, optimize=False)
            meta['directions'][direction] = {'idle': str(idle_path.relative_to(ROOT)), 'source': source_path.name,
                                             'registrationScale': [sx, sy], 'anchor': [ax, ay],
                                             'bootPixelsPreserved': int(boots.sum()),
                                             'correctedPeakSource': 'source-front-diagonals-corrected.png' if direction == 'down-left' else None}
    (OUT / 'art.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__': main()
