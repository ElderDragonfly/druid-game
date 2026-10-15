"""Build reproducible Basic walk strips, idle atlas, layers and GIF previews.

Python 3 + Pillow, NumPy, SciPy. Front/back retain the approved movement outside
explicit accessory patches. Side drawings use new short-step poses and staff
support. Palette matching is deterministic; GIFs use one shared palette each.
"""
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/art/druid-basic-walk-v1"
APPROVED = ROOT / "docs/art/druid-sprites-v1/druid-04-basic.png"
OLD = {
    "down": ROOT / "docs/art/druid-walk-down-v2/walk-down-64x80.png",
    "up": ROOT / "docs/art/druid-walk-other-directions-v1/walk-up-64x80.png",
}
FRAME = (64, 80)
PREVIEW_SCALE, FRAME_MS = 4, 240
BACKGROUND = (38, 54, 40)
PATCHES = {
    "down": [((21, 35, 43, 49), (45, 7, 63, 30)),
             ((21, 36, 43, 50), (44, 8, 62, 31)),
             ((22, 34, 43, 48), (45, 5, 63, 29)),
             ((22, 35, 43, 49), (45, 7, 63, 30))],
    "up": [((9, 6, 27, 30),), ((8, 6, 26, 30),),
           ((8, 4, 26, 29),), ((8, 5, 26, 30),)],
}


def save_rgba(image, path):
    data = np.array(image)
    data[data[:, :, 3] == 0] = 0
    Image.fromarray(data).save(path)


def crisp(image):
    """Remove isolated generation flecks; never apply this to approved bodies."""
    data = np.array(image.convert("RGBA"))
    data[:, :, 3] = np.where(data[:, :, 3] >= 128, 255, 0)
    # Extremely saturated bright edge flecks aren't part of the earthy palette.
    hsv = np.array(Image.fromarray(data[:, :, :3]).convert("HSV"))
    neon = (hsv[:, :, 1] > 225) & (hsv[:, :, 2] > 200)
    data[neon] = 0
    visible = {(x, y) for y in range(image.height) for x in range(image.width) if data[y, x, 3]}
    components = []
    while visible:
        points = {visible.pop()}
        queue = deque(points)
        while queue:
            x, y = queue.popleft()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    point = (x + dx, y + dy)
                    if point in visible:
                        visible.remove(point)
                        points.add(point)
                        queue.append(point)
        components.append(points)
    largest = max(components, key=len)
    for points in components:
        if points is not largest:
            for x, y in points:
                data[y, x] = 0
    return Image.fromarray(data)


def front_back(direction, edits):
    original = Image.open(OLD[direction]).convert("RGBA")
    result = original.copy()
    edit_row = 0 if direction == "down" else 80
    patch_mask = np.zeros((80, 256), dtype=bool)
    for index, regions in enumerate(PATCHES[direction]):
        for left, top, right, bottom in regions:
            rect = (index * 64 + left, top, index * 64 + right, bottom)
            patch = edits.crop((rect[0], top + edit_row, rect[2], bottom + edit_row))
            # Only local wardrobe/staff areas are taken from the new drawing.
            result.paste(patch, rect[:2])
            patch_mask[top:bottom, rect[0]:rect[2]] = True
    assert np.array_equal(np.array(result)[~patch_mask], np.array(original)[~patch_mask])
    return result, patch_mask


def sides(direction):
    source = Image.open(OUT / f"{direction}-source.png").convert("RGBA")
    top, ground = (69, 657) if direction == "left" else (33, 674)
    scale = 70 / (ground - top)
    result = Image.new("RGBA", (256, 80))
    frames = []
    for index in range(4):
        cell = source.crop((round(index * source.width / 4), 0,
                            round((index + 1) * source.width / 4), source.height))
        frame = cell.transform(FRAME, Image.Transform.AFFINE,
                               (1 / scale, 0, cell.width / 2 - 32 / scale,
                                0, 1 / scale, ground - 75 / scale), Image.Resampling.NEAREST)
        frames.append(crisp(frame))
    if direction == "right":
        # Opposite arm/leg swing: reuse the drawn forward arm on back-leg contact.
        frames[2].paste(frames[1].crop((20, 31, 35, 48)), (20, 31))
        frames = [frames[index] for index in (0, 3, 2, 1)]
    for index, frame in enumerate(frames):
        result.paste(frame, (index * 64, 0))
    return result


def match_cloth(image, direction):
    """Reuse Basic's actual cloth colors; keep skin, beard, rope and wood."""
    data = np.array(image)
    hsv = np.array(image.convert("RGB").convert("HSV"))
    reference = np.array(Image.open(APPROVED).convert("RGBA"))
    ref_hsv = np.array(Image.fromarray(reference[:, :, :3]).convert("HSV"))
    yy, xx = np.indices(data.shape[:2])
    local_x = xx % 64
    green = (data[:, :, 3] >= 128) & (hsv[:, :, 0] >= 32) & (hsv[:, :, 0] <= 110) & (hsv[:, :, 1] >= 46)
    brown = (data[:, :, 3] >= 128) & (yy >= 49) & (hsv[:, :, 0] >= 8) & (hsv[:, :, 0] < 32)
    brown &= (hsv[:, :, 1] >= 46) & (hsv[:, :, 2] >= 18) & (hsv[:, :, 2] <= 185)
    if direction in ("down", "right"):
        brown &= local_x < 48
    else:
        brown &= local_x > 22
    sample_rects = {
        "green": [(470, 105, 720, 230), (365, 355, 535, 485), (325, 640, 370, 800)],
        "brown": [(460, 885, 555, 945), (660, 880, 730, 925), (460, 1060, 515, 1130)],
    }
    for name, mask in [("green", green), ("brown", brown)]:
        samples = np.zeros(reference.shape[:2], dtype=bool)
        for l, t, r, b in sample_rects[name]:
            samples[t:b, l:r] = True
        samples &= reference[:, :, 3] >= 128
        if name == "green":
            samples &= (ref_hsv[:, :, 0] >= 32) & (ref_hsv[:, :, 0] <= 110) & (ref_hsv[:, :, 1] >= 46)
        else:
            samples &= (ref_hsv[:, :, 0] >= 8) & (ref_hsv[:, :, 0] < 32) & (ref_hsv[:, :, 1] >= 46)
        colors, inverse = np.unique(data[:, :, :3][mask], axis=0, return_inverse=True)
        color_hsv = np.array(Image.fromarray(colors[None]).convert("HSV"))[0]
        adjusted = np.empty_like(color_hsv)
        for channel in range(3):
            values, counts = np.unique(hsv[:, :, channel][mask], return_counts=True)
            quantiles = (np.cumsum(counts) - counts / 2) / counts.sum()
            p = np.interp(color_hsv[:, channel], values, quantiles)
            adjusted[:, channel] = np.rint(np.quantile(ref_hsv[:, :, channel][samples], p)).astype(np.uint8)
        desired = np.array(Image.fromarray(adjusted[None], "HSV").convert("RGB"))[0]
        palette = np.unique(reference[:, :, :3][samples], axis=0)
        mapped = palette[cKDTree(palette.astype(float)).query(desired.astype(float))[1]]
        data[:, :, :3][mask] = mapped[inverse]
    return Image.fromarray(data)


def clarify_side_legs(sheet, direction):
    """Keep near/far leg shading consistent when their screen positions swap."""
    data = np.array(sheet)
    for index in ((2, 3) if direction == "left" else (1, 2, 3)):
        frame = data[:, index * 64:(index + 1) * 64]
        hsv = np.array(Image.fromarray(frame[:, :, :3]).convert("HSV"))
        yy, xx = np.indices((80, 64))
        legs = (yy >= (50 if direction == "left" else 54)) & (yy < 75) & (frame[:, :, 3] == 255)
        legs &= (hsv[:, :, 0] < 32) & (hsv[:, :, 1] > 45) & (hsv[:, :, 2] > 20)
        legs &= (xx >= (14 if direction == "left" else 29)) & (xx < (44 if direction == "left" else 59))
        legs &= ~((yy < 67) & ((xx < 21) if direction == "left" else (xx >= 51)))
        split = 32 if direction == "left" else 41
        # Contact phase 2 puts the near leg behind; phase 3 brings it through.
        near = xx >= split if direction == "left" or index == 3 else xx < split
        factor = np.where(near, 1.18, 0.66)
        rgb = np.clip(frame[:, :, :3].astype(float) * factor[:, :, None], 0, 255).astype(np.uint8)
        frame[:, :, :3][legs] = rgb[legs]
    return Image.fromarray(data)


def refine_right_body(sheet):
    """One complete bent free arm; shorter stride, without touching the staff."""
    frames = [sheet.crop((i * 64, 0, (i + 1) * 64, 80)) for i in range(4)]
    master = frames[0]
    mask = Image.new("L", FRAME)
    ImageDraw.Draw(mask).polygon([(26, 31), (30, 32), (30, 37), (28, 42),
                                  (27, 47), (24, 50), (21, 48), (22, 43), (24, 37)], fill=255)
    arm = np.array(master)
    arm[:, :, 3] = np.minimum(arm[:, :, 3], np.array(mask))
    arm = Image.fromarray(arm)
    body_sheet, arm_sheet = Image.new("RGBA", (256, 80)), Image.new("RGBA", (256, 80))
    for index, frame in enumerate(frames):
        data = np.array(frame)
        original = data.copy()
        garment = np.array(master)
        # Garment under the old arm: borrow actual cloth from the same row.
        # This also clears the duplicated fist in contact pose 2.
        for y in range(31, 51):
            for x in range(21, 35):
                data[y, x] = original[y, x - 6] if x < 29 else garment[y, 33 + x % 3]
        data[38, 52] = 0  # Detached cuff pixel left by the old far-side hand.
        body = Image.fromarray(data)
        # Ease from the unchanged hip into 25% less horizontal foot excursion.
        shortened = np.array(body)
        for y in range(52, 75):
            scale = 1 - .25 * min(1, (y - 52) / 12)
            shortened[y] = 0
            for x in range(64):
                source_x = round(38 + (x - 38) / scale)
                if 0 <= source_x < 64:
                    shortened[y, x] = data[y, source_x]
        moved = arm.rotate((-12, 24, 62, 24)[index], Image.Resampling.NEAREST, center=(28, 32))
        layer = Image.new("RGBA", FRAME)
        layer.paste(moved, (0, (0, -1, 0, -1)[index]))
        body = Image.fromarray(shortened)
        body.alpha_composite(layer)
        body_sheet.paste(body, (index * 64, 0))
        arm_sheet.paste(layer, (index * 64, 0))
    save_rgba(arm_sheet, OUT / "walk-right-free-arm-64x80.png")
    return body_sheet


def stable_side_staff(sheet, direction):
    """One rigid arm/staff drawing per direction, not four changing staffs."""
    frames = [sheet.crop((i * 64, 0, (i + 1) * 64, 80)) for i in range(4)]
    master = frames[0 if direction == "left" else 3]
    mask = Image.new("L", FRAME)
    draw = ImageDraw.Draw(mask)
    if direction == "left":
        draw.rectangle((0, 4, 17, 29), fill=255)
        draw.polygon([(10, 29), (21, 30), (27, 33), (26, 39), (20, 39), (10, 36)], fill=255)
        draw.polygon([(12, 37), (18, 37), (19, 54), (18, 61), (19, 72),
                      (17, 75), (13, 75), (13, 61)], fill=255)
        pivot, angles, offsets = (15, 34), (0, 4, 0, -4), (0, 0, -2, -1)
    else:
        draw.polygon([(49, 4), (63, 4), (63, 25), (55, 28), (53, 30),
                      (49, 29), (50, 20), (49, 15)], fill=255)
        draw.polygon([(47, 27), (57, 27), (57, 34), (52, 36),
                      (46, 38), (43, 35), (44, 32)], fill=255)
        draw.polygon([(48, 35), (53, 35), (54, 47), (52, 54), (52, 65),
                      (51, 75), (46, 75), (46, 64), (47, 55), (46, 49), (48, 42)], fill=255)
        pivot, angles, offsets = (50, 32), (0, 0, 4, 4), (0, -2, -1, 0)
    layer = np.array(master)
    layer[:, :, 3] = np.minimum(layer[:, :, 3], np.array(mask))
    yy, xx = np.indices((80, 64))
    hsv = np.array(master.convert("RGB").convert("HSV"))
    cape = (hsv[:, :, 0] >= 32) & (hsv[:, :, 0] <= 110) & (hsv[:, :, 1] >= 46)
    cape &= (yy >= 27) & (yy < 40) & (xx >= (20 if direction == "left" else 43))
    layer[:, :, 3][cape] = 0
    if direction == "left":
        layer[:, :, 3][(yy >= 71) & (xx >= 17)] = 0
    else:
        # Trace the narrow far-side shaft, excluding the adjacent lifted boot.
        # No color threshold: dark wood and dark leather share some RGBs.
        source = np.array(master)
        points_y, points_x = [39, 45, 50, 55, 60, 65, 70, 74], [49, 50, 49, 49, 49, 49, 48, 48]
        for y in range(39, 75):
            center = round(float(np.interp(y, points_y, points_x)))
            layer[y, :, 3] = 0
            for x in range(center - 1, center + 2):
                pixel = source[y, x].copy()
                if not pixel[3]:
                    pixel = np.array([0, 0, 0, 255], dtype=np.uint8)
                layer[y, x] = pixel
    master_layer = Image.fromarray(layer)
    body_sheet, staff_sheet, cloak_sheet, hand_sheet, result = (Image.new("RGBA", (256, 80)) for _ in range(5))
    for index, original in enumerate(frames):
        body = np.array(original)
        if direction == "left":
            remove = ((xx < 18) & (yy < 30)) | ((xx >= 10) & (xx < 28) & (yy >= 29) & (yy < 40))
            remove |= (xx < 22) & (yy >= 38)
        else:
            remove = ((xx >= 49) & (yy < 30)) | ((xx >= 43) & (yy >= 27) & (yy < 39))
            remove |= (xx >= 46) & (yy >= 38)
        hsv = np.array(original.convert("RGB").convert("HSV"))
        cape = (hsv[:, :, 0] >= 32) & (hsv[:, :, 0] <= 110) & (hsv[:, :, 1] >= 46)
        cape &= (yy >= 27) & (yy < 40) & (xx >= (20 if direction == "left" else 43))
        remove &= ~cape
        body[:, :, 3][remove] = 0
        body_frame = Image.fromarray(body)
        # Lifted-staff contact/pass drawings expose complete toes. Reuse those
        # pixels under the old occluder, rather than retaining old shaft fragments.
        clean_foot = frames[2 if index % 2 == 0 else (3 if direction == "left" else 1)]
        foot_rect = (17, 70, 22, 75) if direction == "left" else (46, 67, 64, 75)
        body_frame.paste(clean_foot.crop(foot_rect), foot_rect[:2])
        staff = master_layer.rotate(angles[index], Image.Resampling.NEAREST, center=pivot)
        moved = Image.new("RGBA", FRAME)
        moved.paste(staff, (0, offsets[index]))
        body_sheet.paste(body_frame, (index * 64, 0))
        staff_sheet.paste(moved, (index * 64, 0))
    body_sheet = clarify_side_legs(body_sheet, direction)
    if direction == "right":
        body_sheet = refine_right_body(body_sheet)
    for index in range(4):
        rect = (index * 64, 0, (index + 1) * 64, 80)
        body_frame, moved = body_sheet.crop(rect), staff_sheet.crop(rect)
        composite = Image.new("RGBA", FRAME)
        if direction == "left" and index in (0, 1, 3):
            # Only the bent far hand peeks past the tunic; the arm stays hidden.
            peek = Image.new("RGBA", FRAME)
            draw = ImageDraw.Draw(peek)
            x = 20 if index == 0 else 21
            draw.rectangle((x, 46, x + 3, 46), fill=(66, 42, 24, 255))
            draw.rectangle((x, 47, x + 3, 49), fill=(163, 104, 64, 255))
            draw.rectangle((x + 1, 47, x + 2, 48), fill=(203, 144, 91, 255))
            composite.alpha_composite(peek)
            hand_sheet.paste(peek, (index * 64, 0))
        for part in ((body_frame, moved) if direction == "left" else (moved, body_frame)):
            composite.alpha_composite(part)
        if direction == "left":
            # Cape covers the shoulder even when the forearm rises with the staff.
            cloak = np.array(body_frame)
            hsv = np.array(body_frame.convert("RGB").convert("HSV"))
            cover = (hsv[:, :, 0] >= 32) & (hsv[:, :, 0] <= 110) & (hsv[:, :, 1] >= 46)
            cover &= (xx >= 24) & (yy >= 27) & (yy < 39)
            cloak[:, :, 3][~cover] = 0
            cloak_frame = Image.fromarray(cloak)
            composite.alpha_composite(cloak_frame)
            cloak_sheet.paste(cloak_frame, (index * 64, 0))
        result.paste(composite, rect[:2])
    save_rgba(body_sheet, OUT / f"walk-{direction}-body-64x80.png")
    save_rgba(staff_sheet, OUT / f"walk-{direction}-arm-staff-64x80.png")
    layers = {"body": f"walk-{direction}-body-64x80.png",
              "armStaff": f"walk-{direction}-arm-staff-64x80.png",
              "foreground": direction == "left", "pivot": pivot,
              "angles": angles, "offsetsY": offsets}
    if direction == "left":
        save_rgba(cloak_sheet, OUT / "walk-left-cloak-foreground-64x80.png")
        layers["cloakForeground"] = "walk-left-cloak-foreground-64x80.png"
        save_rgba(hand_sheet, OUT / "walk-left-far-hand-64x80.png")
        layers["farHand"] = "walk-left-far-hand-64x80.png"
    else:
        layers["freeArm"] = "walk-right-free-arm-64x80.png"
        layers["freeArmAngles"] = [-12, 24, 62, 24]
        layers["strideHorizontalScale"] = .75
    return result, layers


def save_preview(direction, sheet):
    save_rgba(sheet, OUT / f"walk-{direction}-64x80.png")
    previews = []
    for index in range(4):
        frame = sheet.crop((index * 64, 0, (index + 1) * 64, 80))
        preview = Image.new("RGBA", FRAME, (*BACKGROUND, 255))
        preview.alpha_composite(frame)
        previews.append(preview.convert("RGB").resize((256, 320), Image.Resampling.NEAREST))
    palette_source = Image.new("RGB", (256, 80), BACKGROUND)
    for index, preview in enumerate(previews):
        palette_source.paste(preview.resize(FRAME, Image.Resampling.NEAREST), (index * 64, 0))
    palette = palette_source.quantize(colors=256, dither=Image.Dither.NONE)
    gif_frames = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in previews]
    gif_frames[0].save(OUT / f"walk-{direction}-preview.gif", save_all=True, append_images=gif_frames[1:],
                       duration=FRAME_MS, loop=0, disposal=2, optimize=False)


if __name__ == "__main__":
    edits = Image.open(OUT / "front-back-edits-source.png").convert("RGBA").resize((256, 160), Image.Resampling.NEAREST)
    # Clean each generated figure independently before selecting local patches.
    for row in range(2):
        for index in range(4):
            rect = (index * 64, row * 80, (index + 1) * 64, (row + 1) * 80)
            edits.paste(crisp(edits.crop(rect)), rect[:2])
    meta = {"reference": str(APPROVED.relative_to(ROOT)), "integrated": True,
            "frameWidth": 64, "frameHeight": 80, "frameCount": 4,
            "frameDurationMs": FRAME_MS, "previewScale": PREVIEW_SCALE,
            "idleAtlas": "idle-64x80.png", "idleDirections": ["down", "up", "left", "right"],
            "referenceSpeed": 220, "referenceFrameDurationMs": 160,
            "defaultSpeed": 220 * 2 / 3,
            "animations": {}}
    idle = Image.new("RGBA", (256, 80))
    for direction_index, direction in enumerate(("down", "up", "left", "right")):
        mask = None
        layers = None
        if direction in OLD:
            sheet, mask = front_back(direction, edits)
        else:
            sheet = sides(direction)
        sheet = match_cloth(sheet, direction)
        if direction in ("left", "right"):
            sheet, layers = stable_side_staff(sheet, direction)
        save_preview(direction, sheet)
        idle.paste(sheet.crop((64, 0, 128, 80)), (direction_index * 64, 0))
        meta["animations"][direction] = {"sheet": f"walk-{direction}-64x80.png",
                                          "gif": f"walk-{direction}-preview.gif",
                                          "source": str(OLD[direction].relative_to(ROOT)) if direction in OLD else f"{direction}-source.png"}
        if mask is not None:
            meta["animations"][direction]["localPatches"] = PATCHES[direction]
        if layers is not None:
            meta["animations"][direction]["layers"] = layers
        print(f"{direction}: 4 frames, {FRAME_MS} ms, separate preview")
    (OUT / "animations.json").write_text(json.dumps(meta, indent=2) + "\n")
    save_rgba(idle, OUT / "idle-64x80.png")
