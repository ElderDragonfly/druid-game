"""Crop wolf animation references without redrawing them. Python 3 + Pillow.

The uploaded JPEG has a baked-in checkerboard. Outside-connected background
and detached neutral flecks are masked; retained foreground RGB is unchanged.
GIFs are previews on a forest-colored backdrop, PNG sheets retain transparency.
"""
import hashlib
import json
import argparse
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/art/2146238c373cba499284aaad3f0af0f5.jpg"
OUT = ROOT / "docs/art/wolf-v1"
WIDTH, HEIGHT = 128, 112
BACKGROUND = (49, 67, 52)
RUN_DROOL = [(119, 113, 136, 130), (231, 122, 248, 137), (345, 109, 368, 132),
             (464, 105, 488, 128), (579, 112, 602, 132)]
RUN_SHADOW = [(44, 133, 139, 147), (148, 133, 252, 147), (262, 134, 372, 148),
              (378, 135, 493, 149), (497, 133, 608, 148)]
WALK_SHADOW = [(40, 207, 143, 220), (145, 207, 251, 220), (254, 207, 361, 220),
               (362, 207, 475, 220), (480, 207, 580, 220), (583, 207, 686, 220)]
ANIMATIONS = {
    "run": {
        "rects": [(42, 88, 142, 152), (145, 88, 254, 152), (259, 88, 373, 152),
                  (375, 88, 494, 152), (496, 88, 610, 152)],
        "durations": [90] * 5,
    },
    "walk": {
        "rects": [(40, 158, 143, 223), (145, 158, 251, 223), (254, 158, 361, 223),
                  (362, 158, 475, 223), (480, 158, 580, 223), (583, 158, 686, 223)],
        "durations": [150] * 6,
        # One enclosed background pocket between the crossed legs.
        "background_seeds": {2: [(300, 199)]},
    },
    "attack": {
        "rects": [(42, 312, 141, 403), (145, 312, 248, 403),
                  (252, 307, 331, 403), (332, 312, 430, 403)],
        "durations": [250, 120, 100, 220],
    },
    "attack-up": {
        "rects": [(42, 312, 141, 403), (42, 222, 134, 312),
                  (137, 222, 218, 312), (219, 222, 316, 312)],
        "durations": [240, 100, 100, 220],
        "shadow_rects": [(42, 356, 141, 377), (42, 285, 134, 309),
                         (137, 285, 218, 309), (219, 285, 316, 309)],
        "detail_regions": {1: [(118, 236, 131, 259)], 2: [(170, 226, 214, 260)]},
        "background_columns": (450, 480, 510),
        "state": "attack-up", "source_row": 4, "initial_source_row": 5,
    },
    "attack-down": {
        "rects": [(42, 312, 141, 403), (145, 312, 248, 403),
                  (252, 307, 331, 403), (332, 312, 430, 403)],
        "durations": [240, 100, 100, 220],
        "shadow_rects": [(42, 356, 141, 377), (145, 350, 248, 377),
                         (252, 345, 331, 378), (332, 355, 430, 393)],
        "detail_regions": {1: [(218, 367, 243, 379)], 2: [(282, 381, 310, 401)]},
        "background_columns": (450, 480, 510),
        "state": "attack-down", "source_row": 5, "initial_source_row": 5,
    },
    "idle": {
        "rects": [(42, 400, 125, 467), (125, 400, 210, 467), (210, 400, 298, 467),
                  (298, 400, 385, 467), (389, 400, 476, 467), (476, 400, 563, 467)],
        "durations": [200] * 6,
        "shadow_rects": [(42, 445, 125, 464), (125, 445, 210, 464), (210, 445, 298, 464),
                         (298, 445, 385, 464), (389, 445, 476, 464), (476, 445, 563, 464)],
        # Align the stationary torso/paws, independently of ear and muzzle motion.
        "source_anchors": [(82, 460), (164, 460), (249, 460),
                           (339, 460), (431, 460), (517, 460)],
        "background_columns": (600, 630, 660),
        "state": "idle", "source_row": 6, "initial_source_row": 6, "game_repeat": -1,
    },
    "death": {
        "rects": [(42, 474, 115, 560), (119, 470, 179, 560), (184, 472, 238, 560),
                  (239, 494, 334, 560), (335, 501, 435, 560), (438, 524, 535, 560),
                  (537, 524, 636, 560)],
        "durations": [100, 100, 120, 100, 100, 100, 1200],
    },
}


def cutout(source, rect, background_seeds=(), shadow_region=None):
    image = source.crop(rect)
    width, height = image.size
    pixels = image.load()
    background, queue = set(), deque()

    def background_like(x, y):
        r, g, b, _ = pixels[x, y]
        threshold = 150
        if (shadow_region and shadow_region[0] <= rect[0] + x < shadow_region[2]
                and shadow_region[1] <= rect[1] + y < shadow_region[3]):
            # Baked shadows can darken the checker to ~130.
            # Flood only from background; the wolf's dark outline bounds fur.
            threshold = 110
        return max(r, g, b) - min(r, g, b) < 32 and (r + g + b) / 3 >= threshold

    for y in range(height):
        for x in range(width):
            if (x in (0, width - 1) or y in (0, height - 1)) and background_like(x, y):
                background.add((x, y))
                queue.append((x, y))
    for source_x, source_y in background_seeds:
        point = (source_x - rect[0], source_y - rect[1])
        assert background_like(*point)
        background.add(point)
        queue.append(point)
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if (0 <= nx < width and 0 <= ny < height and (nx, ny) not in background
                    and background_like(nx, ny)):
                background.add((nx, ny))
                queue.append((nx, ny))
    for x, y in background:
        pixels[x, y] = (0, 0, 0, 0)

    remaining = {(x, y) for y in range(height) for x in range(width) if pixels[x, y][3]}
    components = []
    while remaining:
        component = {remaining.pop()}
        stack = list(component)
        while stack:
            x, y = stack.pop()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    point = (x + dx, y + dy)
                    if point in remaining:
                        remaining.remove(point)
                        component.add(point)
                        stack.append(point)
        components.append(component)
    main = max(components, key=len)
    for component in components:
        if component is main or any(pixels[x, y][0] - pixels[x, y][1] > 25 for x, y in component):
            continue
        for x, y in component:
            pixels[x, y] = (0, 0, 0, 0)

    # Foreground is copied, not recolored, regenerated, sharpened or interpolated.
    for y in range(height):
        for x in range(width):
            if pixels[x, y][3]:
                assert pixels[x, y] == source.getpixel((rect[0] + x, rect[1] + y))
    return image


def restore_drool(source, image, rect, region):
    restored = 0
    for y in range(region[1], region[3]):
        for x in range(region[0], region[2]):
            pixel = source.getpixel((x, y))
            if max(pixel[:3]) < 130:
                at = (x - rect[0], y - rect[1])
                if not image.getpixel(at)[3]:
                    restored += 1
                image.putpixel(at, pixel)
    return restored


def shadow_cutout(source, rect, region, wolf, background_columns=(630, 660, 690)):
    """Recover the original dark shadow's opacity against the baked checkerboard.

    Empty reference columns provide the same checker phase as each source
    pixel. This removes the checker pattern from the shadow instead of copying
    gray rectangles onto a new background. No ellipse is invented or redrawn.
    """
    result = Image.new("RGBA", wolf.size)
    for y in range(region[1], region[3]):
        for x in range(max(rect[0], region[0]), min(rect[2], region[2])):
            local = (x - rect[0], y - rect[1])
            if wolf.getpixel(local)[3]:
                continue
            rgb = source.getpixel((x, y))[:3]
            if max(rgb) - min(rgb) >= 32:
                continue
            expected = sum(sum(source.getpixel((column + x % 30, y))[:3]) / 3
                           for column in background_columns) / len(background_columns)
            difference = expected - sum(rgb) / 3
            if difference >= 16:
                result.putpixel(local, (0, 0, 0, min(140, round(255 * difference / expected))))
    # JPEG noise is often a single isolated pixel; retain connected shadow patches.
    remaining = {(x, y) for y in range(result.height) for x in range(result.width)
                 if result.getpixel((x, y))[3]}
    while remaining:
        component = {remaining.pop()}
        stack = list(component)
        while stack:
            x, y = stack.pop()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    point = (x + dx, y + dy)
                    if point in remaining:
                        remaining.remove(point)
                        component.add(point)
                        stack.append(point)
        if len(component) < 4:
            for point in component:
                result.putpixel(point, (0, 0, 0, 0))
    return result


def save_animation(source, name, settings):
    frames, metadata, shadows = [], [], []
    for index, rect in enumerate(settings["rects"]):
        shadow_region = settings["shadow_rects"][index] if "shadow_rects" in settings else None
        cropped = cutout(source, rect, settings.get("background_seeds", {}).get(index, ()), shadow_region)
        bounds = cropped.getbbox()
        restored = restore_drool(source, cropped, rect, RUN_DROOL[index]) if name == "run" else 0
        for region in settings.get("detail_regions", {}).get(index, ()):
            restored += restore_drool(source, cropped, rect, region)
        offset_x = 64 - (bounds[0] + bounds[2]) // 2
        # Keep airborne running phases above their shared ground line.
        offset_y = 100 - (148 - rect[1]) if name == "run" else 100 - bounds[3]
        if name == "walk":
            offset_y = 100 - (219 - rect[1])
        if "source_anchors" in settings:
            anchor_x, anchor_y = settings["source_anchors"][index]
            offset_x, offset_y = 64 - (anchor_x - rect[0]), 100 - (anchor_y - rect[1])
        frame = Image.new("RGBA", (WIDTH, HEIGHT))
        assert 0 <= bounds[0] + offset_x < bounds[2] + offset_x <= WIDTH
        assert 0 <= bounds[1] + offset_y < bounds[3] + offset_y <= HEIGHT
        frame.paste(cropped, (offset_x, offset_y))
        shadow = Image.new("RGBA", (WIDTH, HEIGHT))
        if name == "run":
            shadow.paste(shadow_cutout(source, rect, RUN_SHADOW[index], cropped), (offset_x, offset_y))
        elif name == "walk":
            # The sixth wolf occupies columns 630–689 in this row.
            shadow.paste(shadow_cutout(source, rect, WALK_SHADOW[index], cropped,
                                       background_columns=(0, 690)), (offset_x, offset_y))
        elif "shadow_rects" in settings:
            shadow.paste(shadow_cutout(source, rect, settings["shadow_rects"][index], cropped,
                                       settings["background_columns"]), (offset_x, offset_y))
        shadows.append(shadow)
        frames.append(frame)
        metadata.append({"sourceRect": list(rect), "drawOffset": [offset_x, offset_y],
                         "atlasFrame": {"x": index * WIDTH, "y": 0, "width": WIDTH, "height": HEIGHT}})
        if name == "run":
            metadata[-1].update({"restoredDroolPixels": restored, "droolSourceRect": list(RUN_DROOL[index]),
                                 "shadowSourceRect": list(RUN_SHADOW[index])})
        elif name == "walk":
            metadata[-1]["shadowSourceRect"] = list(WALK_SHADOW[index])
            metadata[-1]["backgroundSeeds"] = settings.get("background_seeds", {}).get(index, [])
        elif "shadow_rects" in settings:
            metadata[-1].update({"shadowSourceRect": list(settings["shadow_rects"][index]),
                                 "restoredDroolPixels": restored,
                                 "droolSourceRects": settings.get("detail_regions", {}).get(index, []),
                                 "sourceRow": settings["initial_source_row"] if index == 0
                                 else settings["source_row"]})
        if "source_anchors" in settings:
            metadata[-1]["sourceAnchor"] = list(settings["source_anchors"][index])

    atlas = Image.new("RGBA", (WIDTH * len(frames), HEIGHT))
    shadow_atlas = Image.new("RGBA", atlas.size)
    previews = []
    for index, frame in enumerate(frames):
        atlas.paste(frame, (index * WIDTH, 0))
        shadow_atlas.paste(shadows[index], (index * WIDTH, 0))
        preview = Image.new("RGBA", (WIDTH, HEIGHT), (*BACKGROUND, 255))
        preview.alpha_composite(shadows[index])
        preview.alpha_composite(frame)
        previews.append(preview.convert("RGB").resize((WIDTH * 3, HEIGHT * 3), Image.Resampling.NEAREST))
    atlas.save(OUT / f"wolf-{name}.png")
    if name in ("run", "walk") or "shadow_rects" in settings:
        shadow_atlas.save(OUT / f"wolf-{name}-shadow.png")
    palette_source = Image.new("RGB", (WIDTH * len(frames), HEIGHT), BACKGROUND)
    for index, preview in enumerate(previews):
        palette_source.paste(preview.resize((WIDTH, HEIGHT), Image.Resampling.NEAREST), (index * WIDTH, 0))
    palette = palette_source.quantize(colors=256, dither=Image.Dither.NONE)
    previews = [image.quantize(palette=palette, dither=Image.Dither.NONE) for image in previews]
    previews[0].save(OUT / f"wolf-{name}.gif", save_all=True, append_images=previews[1:],
                     duration=settings["durations"], loop=0, disposal=2, optimize=False)
    result = {"frames": metadata, "durations": settings["durations"], "previewScale": 3,
              "gameRepeat": settings.get("game_repeat", -1 if name in ("run", "walk") else 0)}
    if name == "run":
        result.update({"state": "aggro-run", "sourceRow": 2, "shadowAtlas": "wolf-run-shadow.png",
                       "mirrorForLeft": True})
    elif name == "walk":
        result.update({"state": "wander-walk", "sourceRow": 3, "shadowAtlas": "wolf-walk-shadow.png",
                       "mirrorForLeft": True})
    elif "source_row" in settings:
        result.update({"state": settings["state"], "sourceRow": settings["source_row"],
                       "initialSourceRow": settings["initial_source_row"],
                       "shadowAtlas": f"wolf-{name}-shadow.png", "mirrorForLeft": True})
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", choices=ANIMATIONS, help="Update one animation, keeping the others unchanged")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    original = Image.open(SOURCE).convert("RGBA")
    metadata = {"source": str(SOURCE.relative_to(ROOT)),
                "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                "credit": "ripped by Maxim (visible on uploaded reference)",
                "frameWidth": WIDTH, "frameHeight": HEIGHT, "origin": [64, 100],
                "previewBackground": list(BACKGROUND), "integrated": False, "animations": {}}
    if args.only and (OUT / "animations.json").exists():
        metadata = json.loads((OUT / "animations.json").read_text())
    for name, settings in ANIMATIONS.items():
        if args.only and name != args.only:
            continue
        metadata["animations"][name] = save_animation(original, name, settings)
        print(f"{name}: {len(settings['rects'])} frames, {sum(settings['durations'])} ms")
    (OUT / "animations.json").write_text(json.dumps(metadata, indent=2) + "\n")
