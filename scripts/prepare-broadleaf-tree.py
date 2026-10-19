"""Cut the uploaded JPEG mechanically; never recolour or generate tree pixels."""
from collections import deque
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/art/4e86ea700a01cfabe8102492566677b2.jpg'
OUTPUT = ROOT / 'docs/art/broadleaf-tree-v1'
# Verified enclosed backdrop patches under the lower canopy, in source pixels.
# Explicit seeds avoid treating similarly coloured bark elsewhere as background.
INTERIOR_BACKGROUND_SEEDS = (
    (226, 538), (244, 536), (267, 547), (271, 551), (276, 563), (292, 577),
    (363, 600), (372, 597), (378, 592), (399, 591), (418, 576),
)


def prepare():
    source = Image.open(SOURCE).convert('RGB')
    width, height = source.size
    pixels = source.load()
    background = pixels[0, 0]
    exterior = bytearray(width * height)
    queue = deque([(0, 0)])
    # Only background connected to the outside is removed. Interior highlights,
    # foliage and bark keep their exact JPEG RGB values, with no erosion.
    while queue:
        x, y = queue.popleft()
        if not (0 <= x < width and 0 <= y < height):
            continue
        index = y * width + x
        if exterior[index]:
            continue
        if sum((a - b) ** 2 for a, b in zip(pixels[x, y], background)) > 42 ** 2:
            continue
        exterior[index] = 1
        queue.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))

    result = source.convert('RGBA')
    rgba = result.load()
    for y in range(height):
        for x in range(width):
            # The reference has a horizontal ground guide extending beyond the
            # roots. Remove just that line, retaining the trunk/root silhouette.
            guide = y >= 759 or (y >= 754 and (x < 273 or x >= 399))
            if exterior[y * width + x] or guide:
                rgba[x, y] = (0, 0, 0, 0)
    # Discard detached JPEG ringing/guide specks, without touching the tree.
    connected = set()
    queue = deque([(332, 700)])
    while queue:
        x, y = queue.popleft()
        if not (0 <= x < width and 0 <= y < height) or (x, y) in connected or not rgba[x, y][3]:
            continue
        connected.add((x, y))
        queue.extend((x + dx, y + dy) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dx or dy)
    for y in range(height):
        for x in range(width):
            if rgba[x, y][3] and (x, y) not in connected:
                rgba[x, y] = (0, 0, 0, 0)
    # Flood only the individually inspected beige gaps. Do this after the
    # silhouette cleanup, so opening a gap never prunes neighbouring twigs.
    queue = deque(INTERIOR_BACKGROUND_SEEDS)
    while queue:
        x, y = queue.popleft()
        if not (0 <= x < width and 0 <= y < height) or not rgba[x, y][3]:
            continue
        if sum((a - b) ** 2 for a, b in zip(pixels[x, y], background)) > 42 ** 2:
            continue
        rgba[x, y] = (0, 0, 0, 0)
        queue.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))
    bounds = result.getbbox()
    result = result.crop(bounds)
    OUTPUT.mkdir(exist_ok=True)
    result.save(OUTPUT / 'broadleaf.png')
    metadata = {
        'source': str(SOURCE.relative_to(ROOT)), 'sourceCrop': list(bounds),
        'backgroundRGB': list(background), 'exteriorTolerance': 42,
        'interiorBackgroundSeeds': [list(point) for point in INTERIOR_BACKGROUND_SEEDS],
        'preservesOpaqueRGB': True,
        'sprite': {
            'id': 'broadleaf', 'texture': 'forest-broadleaf',
            'width': result.width, 'height': result.height, 'scale': 0.375,
            'anchorX': 332 - bounds[0], 'anchorY': 757 - bounds[1],
            'bodyWidth': 36, 'bodyHeight': 18, 'bodyInsetBottom': 14,
        },
    }
    (OUTPUT / 'sprite.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(json.dumps(metadata))


if __name__ == '__main__':
    prepare()
