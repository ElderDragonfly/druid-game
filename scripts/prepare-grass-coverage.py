"""Extract a grass-only height mask. Optional art tool: Python 3 + Pillow.

Only the new grayscale mask is written. Approved grass PNGs are never modified.
Black means ground/gap; other values are the blade's distance above its root.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/art/upright-grass-preview-v1/grass-previous-reference.png"
OUTPUT = ROOT / "src/assets/environment/grass-coverage-heights.png"
SIZE = 256

# Bounds and root rows of visible clumps, in the working sample. Bounds only
# restrict extraction; they are never filled into the output mask.
CLUMPS = [
    (0, 20, 0, 13), (104, 157, 0, 48), (155, 195, 0, 30), (180, 256, 0, 59),
    (24, 87, 20, 67), (0, 30, 57, 85), (62, 113, 47, 82), (98, 153, 63, 104),
    (151, 175, 63, 89), (181, 217, 76, 115), (217, 256, 50, 92),
    (0, 44, 87, 126), (37, 64, 80, 103), (102, 130, 91, 117),
    (53, 125, 101, 152), (131, 164, 121, 155), (174, 200, 103, 126),
    (222, 248, 109, 135), (0, 44, 125, 175), (33, 77, 141, 185),
    (56, 94, 163, 191), (99, 138, 156, 194), (125, 171, 157, 199),
    (163, 211, 167, 213), (188, 236, 154, 213), (229, 256, 160, 214),
    (0, 33, 204, 242), (33, 63, 210, 252), (62, 97, 224, 256),
    (53, 87, 195, 234), (84, 116, 204, 248), (126, 153, 197, 239),
    (143, 197, 209, 256), (183, 231, 214, 250), (216, 256, 210, 256),
]


def extract():
    source = Image.open(SOURCE).convert("RGB").resize((SIZE, SIZE), Image.Resampling.NEAREST)
    pixels = source.load()
    core, allowed = set(), set()
    for y in range(SIZE):
        for x in range(SIZE):
            r, g, b = pixels[x, y]
            stem = b > .61 * g and r < .70 * g and g < 125
            leaf = b > .53 * g and r < .73 * g and g < 145
            tip = g > 145 and r > 103 and b < .53 * g
            if stem:
                core.add((x, y))
            if stem or leaf or tip:
                allowed.add((x, y))

    mask = Image.new("L", (SIZE, SIZE))
    heights = mask.load()
    for left, right, top, root in CLUMPS:
        remaining = {(x, y) for x, y in allowed if left <= x < right and top <= y < root}
        while remaining:
            start = remaining.pop()
            connected, stack = {start}, [start]
            while stack:
                x, y = stack.pop()
                for point in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if point in remaining:
                        remaining.remove(point)
                        connected.add(point)
                        stack.append(point)
            ys = [y for _, y in connected]
            # Discard disconnected highlights, ground flecks and shallow shadow marks.
            if (len(connected) < 6 or max(ys) - min(ys) < 3
                    or max(ys) < top + (root - top) * .5 or not connected & core):
                continue
            for x, y in connected:
                value = root - 1 - y
                if value > 0 and (not heights[x, y] or value < heights[x, y]):
                    heights[x, y] = value
    return mask


if __name__ == "__main__":
    result = extract()
    result.save(OUTPUT)
    print(f"Saved {OUTPUT.relative_to(ROOT)}: {SIZE}×{SIZE}, {sum(value > 0 for value in result.tobytes())} blade pixels")
