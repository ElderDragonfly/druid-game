"""Prepare mouse animation sheets. Art helper: Python 3 + Pillow.

The uploaded GIF is extracted mechanically. Only the new generated movement art
is reduced and mapped to its palette; reference pixels are never repainted.
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/art/91f9b8a17e977a2a9d71e0fbc551f757.gif"
OUT = ROOT / "docs/art/mouse-v1"
BACKGROUND = {(50, 65, 70), (100, 115, 120)}
CROP = (104, 128, 360, 384)
SIZE, FEET_X, FEET_Y = 32, 16, 25


def extract_reference():
    gif = Image.open(SOURCE)
    frames, durations = [], []
    for index in range(gif.n_frames):
        gif.seek(index)
        original = gif.convert("RGBA")
        small = original.crop(CROP).resize((SIZE, SIZE), Image.Resampling.NEAREST)
        for y in range(SIZE):
            for x in range(SIZE):
                rgba = small.getpixel((x, y))
                if rgba[:3] in BACKGROUND:
                    small.putpixel((x, y), (0, 0, 0, 0))
                else:
                    # The source is already pixel art enlarged in exact 8×8 blocks.
                    assert rgba == original.getpixel((CROP[0] + x * 8, CROP[1] + y * 8))
        frames.append(small)
        durations.append(gif.info["duration"])
    return frames, durations


def sheet(frames, name):
    result = Image.new("RGBA", (SIZE * len(frames), SIZE))
    for index, frame in enumerate(frames):
        result.paste(frame, (index * SIZE, 0))
    result.save(OUT / name)


def prepare_motion(reference):
    source = Image.open(OUT / "mouse-motion-source.png").convert("RGBA")
    cells = [source.crop((round(i % 4 * source.width / 4), round(i // 4 * source.height / 2),
                          round((i % 4 + 1) * source.width / 4), round((i // 4 + 1) * source.height / 2)))
             for i in range(8)]
    palette = sorted({pixel[:3] for frame in reference for pixel in frame.getdata() if pixel[3]})

    def body_bounds(cell):
        points = [(x, y) for y in range(cell.height) for x in range(cell.width)
                  if (p := cell.getpixel((x, y)))[3] >= 128 and p[0] < 160 and p[1] < 140 and p[2] < 140]
        return min(x for x, y in points), min(y for x, y in points), max(x for x, y in points) + 1, max(y for x, y in points) + 1

    standing = body_bounds(cells[-1])
    scale = 18 / (standing[3] - standing[1])
    result = []
    for cell in cells:
        bounds = body_bounds(cell)
        center_x = (bounds[0] + bounds[2]) / 2
        ground = max(y + 1 for y in range(cell.height) for x in range(cell.width)
                     if cell.getpixel((x, y))[3] >= 128)
        native = Image.new("RGBA", (SIZE, SIZE))
        for y in range(SIZE):
            for x in range(SIZE):
                sx = int(center_x + (x + .5 - FEET_X) / scale)
                sy = int(ground + (y + .5 - FEET_Y) / scale)
                if not (0 <= sx < cell.width and 0 <= sy < cell.height):
                    continue
                rgba = cell.getpixel((sx, sy))
                if rgba[3] < 128:
                    continue
                rgb = min(palette, key=lambda color: sum((color[c] - rgba[c]) ** 2 for c in range(3)))
                native.putpixel((x, y), (*rgb, 255))
        result.append(native)
    # End on the exact supplied standing figure, then play its original 9 frames.
    result[-1] = reference[0].copy()
    sheet(result[:4], "mouse-run-32x32.png")
    sheet(result[4:], "mouse-rise-32x32.png")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    frames, durations = extract_reference()
    sheet(frames, "mouse-look-32x32.png")
    prepare_motion(frames)
    (OUT / "source.json").write_text(json.dumps({
        "source": str(SOURCE.relative_to(ROOT)),
        "authorCredit": "LANCEKIM0806 (visible in uploaded GIF)",
        "crop": list(CROP), "sourcePixelScale": 8,
        "frameWidth": SIZE, "frameHeight": SIZE, "frameCount": len(frames),
        "durations": durations, "anchorX": FEET_X, "anchorY": FEET_Y,
        "backgroundColors": sorted(map(list, BACKGROUND)),
        "newMotionArt": "mouse-motion-source.png", "runFrames": 4, "riseFrames": 4,
    }, indent=2) + "\n")
    print("Prepared original look animation (5400ms), four running phases, four rise phases.")
