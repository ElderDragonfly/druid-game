"""Clean the approved PNG sprites directly. Optional tool: Python 3 + Pillow."""

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs/art/conifer-trees-v1"
BASELINE = OUTPUT / "approved-source"
NEIGHBORS = [(1, 0), (-1, 0), (0, 1), (0, -1)]


def clean_outer_silhouette(image):
    """Protect branch gaps by filling row/column spans in a separate guard mask."""
    pixels = image.load()
    opaque = {(x, y) for y in range(image.height) for x in range(image.width)
              if pixels[x, y][3]}
    rows, columns = {}, {}
    for x, y in opaque:
        rows.setdefault(y, []).append(x)
        columns.setdefault(x, []).append(y)
    silhouette = set(opaque)
    for y, xs in rows.items():
        silhouette.update((x, y) for x in range(min(xs), max(xs) + 1))
    for x, ys in columns.items():
        silhouette.update((x, y) for y in range(min(ys), max(ys) + 1))

    result = image.copy()
    removed = set()
    for x, y in opaque:
        rgb = pixels[x, y][:3]
        # Only light, nearly neutral JPEG flecks on the original outside silhouette.
        if (sum(rgb) >= 420 and max(rgb) - min(rgb) <= 20
                and any((x + dx, y + dy) not in silhouette for dx, dy in NEIGHBORS)):
            result.putpixel((x, y), (0, 0, 0, 0))
            removed.add((x, y))
    # All other RGBA pixels, including existing gaps, remain the original PNG bytes.
    for y in range(image.height):
        for x in range(image.width):
            if (x, y) not in removed:
                assert result.getpixel((x, y)) == pixels[x, y]
    return result, len(removed)


metadata = json.loads((BASELINE / "sprites.json").read_text())
source = Image.open(BASELINE / "trees-atlas.png").convert("RGBA")
atlas = Image.new("RGBA", source.size)
preview = Image.new("RGBA", (source.width, 464))
draw = ImageDraw.Draw(preview)
for y in range(0, preview.height, 16):
    for x in range(0, preview.width, 16):
        draw.rectangle((x, y, x + 15, y + 15),
                       fill="#858b80" if (x // 16 + y // 16) % 2 else "#92968c")

removed_total = 0
for index, sprite in enumerate(metadata["sprites"]):
    frame = sprite["atlasFrame"]
    x, y, width, height = (frame[key] for key in ("x", "y", "width", "height"))
    original = source.crop((x, y, x + width, y + height))
    cleaned, removed = clean_outer_silhouette(original)
    removed_total += removed
    cleaned.save(OUTPUT / sprite["file"])
    assert Image.open(OUTPUT / sprite["file"]).convert("RGBA").tobytes() == cleaned.tobytes()
    atlas.paste(cleaned, (x, y))
    preview.alpha_composite(cleaned, (x, y))
    draw.text((index * 240 + 112, 436), f"0{index + 1}", fill="#f1e6c1")
    print(sprite["id"], f"{removed} outside flecks removed; original interior RGBA preserved")

atlas.save(OUTPUT / "trees-atlas.png")
preview.save(OUTPUT / "trees-preview.png")
metadata["extraction"]["removedEdgePixels"] = removed_total
metadata["extraction"]["baselineCommit"] = "4e1d475"
metadata["extraction"]["baselineAtlasSha256"] = hashlib.sha256(
    (BASELINE / "trees-atlas.png").read_bytes()).hexdigest()
metadata["extraction"]["edgeCleanupScope"] = "outside row/column silhouette; branch gaps protected"
metadata["extraction"]["method"] = "approved PNG frames directly; light neutral exterior flecks only"
(OUTPUT / "sprites.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
print(f"Total: {removed_total} exterior flecks removed from the approved PNGs.")
