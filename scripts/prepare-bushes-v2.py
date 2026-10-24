"""Use the edited woodland palette on the original pixel silhouettes, without ground."""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import label

ROOT = Path(__file__).resolve().parents[1]
OLD = ROOT / 'docs/art/forest-bushes-v1'
OUT = ROOT / 'docs/art/forest-bushes-v2'
OUT.mkdir(exist_ok=True)
meta = json.loads((OLD / 'sprites.json').read_text())
reference = np.array(Image.open(OUT / 'palette-reference.png').convert('RGBA'))
colors = reference[:, :, :3][reference[:, :, 3] > 240]
weights = np.array([.2126, .7152, .0722])
luma = colors @ weights
palette = []
for a, b in [(0, 5), (5, 15), (15, 30), (30, 50), (50, 70), (70, 85), (85, 95), (95, 100)]:
    low, high = np.percentile(luma, [a, b])
    palette.append(np.median(colors[(luma >= low) & (luma <= high)], axis=0).astype('uint8'))
palette = np.array(palette)

# The low outer contours of the green plants. Above these lines the original
# leaves remain intact; below them are only the flat lime swatches and JPEG rims.
bottoms = {
    1: [(0, 40), (22, 46), (28, 58), (43, 61), (48, 65), (56, 60), (83, 61), (101, 62), (108, 50), (130, 42)],
    4: [(0, 61), (14, 65), (23, 76), (40, 79), (61, 81), (72, 79), (94, 78), (101, 72), (114, 66), (130, 62)],
    5: [(0, 31), (25, 37), (28, 48), (38, 50), (43, 53), (50, 51), (67, 50), (72, 51), (76, 55), (82, 52), (105, 50), (110, 42), (139, 30)],
    6: [(0, 32), (27, 37), (30, 51), (41, 56), (49, 55), (59, 53), (74, 52), (80, 53), (83, 58), (89, 57), (97, 54), (118, 53), (122, 44), (145, 32)],
}
atlas = Image.new('RGBA', (1600, 144))
preview = Image.new('RGB', (800, 352), '#243b2a')
for index, sprite in enumerate(meta['sprites']):
    original = np.array(Image.open(OLD / f'bush-{index}.png').convert('RGBA'))
    rgb = original[:, :, :3].astype(float)
    r, g, b = rgb.transpose(2, 0, 1)
    mask = original[:, :, 3] > 0
    h, w = mask.shape
    if index in (0, 2, 3, 7):
        # Cyan foliage/purple outlines are distinct from every green ground remnant.
        mask &= ~((g - b > 24) & (g - r > 8))
    else:
        points = np.array(bottoms[index])
        edge = np.interp(np.arange(w), points[:, 0], points[:, 1])
        mask &= np.arange(h)[:, None] < edge[None, :]
        # Remove pale lime ground visible between the lowest leaves as well.
        base = np.arange(h)[:, None] >= h * .62
        mask &= ~(base & (r > g * .73) & (g > b * 1.8) & (g > 125))
    components, _ = label(mask)
    sizes = np.bincount(components.ravel()); sizes[0] = 0
    # Only disconnected ground crumbs are discarded, never an interior leaf area.
    mask &= sizes[components] >= 8
    values = rgb @ weights
    low, high = np.percentile(values[mask], [3, 98])
    level = np.rint(np.clip((values - low) / max(1, high - low), 0, 1) * (len(palette) - 1)).astype(int)
    result = np.zeros_like(original)
    result[mask, :3] = palette[level[mask]]
    result[mask, 3] = 255
    image = Image.fromarray(result)
    image.save(OUT / f'bush-{index}.png')
    atlas.paste(image, (sprite['frame']['x'], 0))
    preview.paste(image, (index % 4 * 200 + (200 - w) // 2, index // 4 * 176 + 150 - h), image)
    ImageDraw.Draw(preview).text((index % 4 * 200 + 10, index // 4 * 176 + 158), str(index + 1), fill='#d5d8ad')
atlas.save(OUT / 'foliage-atlas.png')
preview.save(OUT / 'collection.png')
meta.update({'preservesOpaqueRGB': False, 'groundRemoved': True,
             'paletteReference': 'palette-reference.png', 'palette': palette.tolist()})
(OUT / 'sprites.json').write_text(json.dumps(meta, indent=2) + '\n')
print('Prepared eight foliage-only bushes with one shared woodland palette; original anchors retained.')
