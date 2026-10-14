"""Extract the four approved trees. Optional art tool: Python 3 + Pillow."""

import hashlib
import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/art/DarbxwNV4AAsS-l.jpg"
OUTPUT = ROOT / "docs/art/conifer-trees-v1"
BACKGROUND = (139, 142, 131)
TOLERANCE = 16  # The uploaded JPEG has compression noise around its flat background.
PADDING = 8
BOXES = [(52, 60, 225, 455), (225, 60, 433, 455),
         (433, 60, 598, 455), (598, 60, 810, 455)]
IDS = ["pine-01-dark", "pine-02-purple", "pine-03-light", "pine-04-bright"]


def foreground(crop):
    pixels = crop.load()
    points = {(x, y) for y in range(crop.height) for x in range(crop.width)
              if max(abs(a - b) for a, b in zip(pixels[x, y], BACKGROUND)) > TOLERANCE}
    components = []
    while points:
        first = points.pop()
        queue, component = deque([first]), {first}
        while queue:
            x, y = queue.popleft()
            for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1),
                           (1, 1), (-1, 1), (1, -1), (-1, -1)]:
                adjacent = (x + dx, y + dy)
                if adjacent in points:
                    points.remove(adjacent)
                    component.add(adjacent)
                    queue.append(adjacent)
        components.append(component)
    # Every tree is connected; the other components are isolated JPEG noise (1–2 pixels).
    components.sort(key=len, reverse=True)
    assert len(components[0]) > 20_000
    assert all(len(component) <= 2 for component in components[1:])
    return components[0]


source = Image.open(SOURCE).convert("RGB")
assert source.size == (840, 840)
(OUTPUT / "sprites").mkdir(parents=True, exist_ok=True)
atlas = Image.new("RGBA", (960, 432))
preview = Image.new("RGBA", (960, 464))
draw = ImageDraw.Draw(preview)
for y in range(0, preview.height, 16):
    for x in range(0, preview.width, 16):
        draw.rectangle((x, y, x + 15, y + 15),
                       fill="#858b80" if (x // 16 + y // 16) % 2 else "#92968c")

sprites = []
preserved_pixels = 0
for index, (box, sprite_id) in enumerate(zip(BOXES, IDS)):
    crop = source.crop(box)
    points = foreground(crop)
    xs, ys = zip(*points)
    x0, y0, x1, y1 = min(xs), min(ys), max(xs) + 1, max(ys) + 1
    image = Image.new("RGBA", (x1 - x0 + PADDING * 2, y1 - y0 + PADDING * 2))
    for x, y in points:
        rgb = crop.getpixel((x, y))
        image.putpixel((x - x0 + PADDING, y - y0 + PADDING), (*rgb, 255))
        preserved_pixels += 1
    base = [(x - x0 + PADDING, y - y0 + PADDING)
            for x, y in points if y >= y1 - 28]
    base_left, base_right = min(x for x, _ in base), max(x for x, _ in base) + 1
    width, height = image.size
    frame_x, frame_y = index * 240 + (240 - width) // 2, 410 - height
    atlas.paste(image, (frame_x, frame_y))
    preview.alpha_composite(image, (frame_x, frame_y))
    draw.text((index * 240 + 112, 436), f"0{index + 1}", fill="#f1e6c1")
    file = f"sprites/{sprite_id}.png"
    image.save(OUTPUT / file)
    # Verify the saved transparent sprite against the actual uploaded source, not a generated copy.
    saved = Image.open(OUTPUT / file).convert("RGBA")
    for x, y in points:
        assert saved.getpixel((x - x0 + PADDING, y - y0 + PADDING)) == (*crop.getpixel((x, y)), 255)
    sprites.append({
        "id": sprite_id, "title": f"Дерево 0{index + 1}", "category": "tree",
        "width": width, "height": height,
        "anchorX": (base_left + base_right) / 2, "anchorY": height - PADDING,
        "baseWidth": base_right - base_left, "baseHeight": 28,
        "atlasFrame": {"x": frame_x, "y": frame_y, "width": width, "height": height},
        "sourceCrop": {"x": box[0] + x0, "y": box[1] + y0,
                       "width": x1 - x0, "height": y1 - y0},
        "file": file,
    })

atlas.save(OUTPUT / "trees-atlas.png")
preview.save(OUTPUT / "trees-preview.png")
metadata = {
    "status": "integrated", "padding": PADDING, "scale": 0.6875,
    "referenceCredit": "@KIANAMOSSER (label in the supplied reference)",
    "sourceFile": "../DarbxwNV4AAsS-l.jpg",
    "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    "extraction": {"backgroundRgb": BACKGROUND, "backgroundTolerance": TOLERANCE,
                   "method": "original RGB pixels, transparent background, largest connected tree"},
    "sprites": sprites,
}
(OUTPUT / "sprites.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
print(f"Extracted 4 trees; verified {preserved_pixels} unchanged opaque RGB pixels.")
for sprite in sprites:
    print(sprite["id"], f'{sprite["width"]}x{sprite["height"]}',
          f'world height {sprite["height"] * metadata["scale"]:.1f}',
          f'base {sprite["baseWidth"] * metadata["scale"]:.1f}x{sprite["baseHeight"] * metadata["scale"]:.1f}')
