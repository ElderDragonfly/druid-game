"""Transfer Wanderer cloth colors to Basic without redrawing any pixels.

Python 3, Pillow, NumPy, SciPy. The input defaults to the last approved drawing
in Git, so rerunning the correction never compounds it. --input accepts a local
copy of that drawing when the historical commit is unavailable.
"""
import argparse
import io
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "docs/art/druid-sprites-v1"
BASELINE = "84c16ba:docs/art/druid-sprites-v1/druid-04-basic.png"
REFERENCE = FOLDER / "druid-01-wanderer.png"
OUTPUT = FOLDER / "druid-04-basic.png"

# Accessory-free reference patches, in unchanged 1254x1254 image coordinates.
GREEN_SAMPLES = [(470, 105, 720, 230), (365, 355, 535, 485),
                 (325, 640, 370, 800), (780, 650, 815, 820)]
BROWN_SAMPLES = [(610, 475, 685, 525), (610, 690, 665, 770),
                 (460, 885, 555, 945), (660, 880, 730, 925)]


def rectangles(shape, regions):
    mask = np.zeros(shape, dtype=bool)
    for left, top, right, bottom in regions:
        mask[top:bottom, left:right] = True
    return mask


def polygon(shape, points):
    canvas = Image.new("1", (shape[1], shape[0]))
    ImageDraw.Draw(canvas).polygon(points, fill=1)
    return np.array(canvas, dtype=bool)


def hsv_of(rgba):
    return np.asarray(Image.fromarray(rgba[:, :, :3]).convert("HSV"))


def material(rgba, hsv, name):
    h, s, v = (hsv[:, :, i] for i in range(3))
    visible = rgba[:, :, 3] >= 128
    if name == "green":
        return visible & (h >= 32) & (h <= 110) & (s >= 46) & (v >= 18)
    return visible & (h >= 8) & (h < 32) & (s >= 46) & (v >= 18) & (v <= 185)


def garment_masks(rgba, hsv):
    shape = rgba.shape[:2]
    green = material(rgba, hsv, "green") & rectangles(shape, [(260, 80, 920, 975)])
    # The staff crosses the right cape. Protect that entire strip and both hands.
    protected = polygon(shape, [(856, 428), (890, 435), (890, 700), (860, 975),
                                 (810, 1065), (780, 1055), (802, 820), (820, 620)])
    protected |= rectangles(shape, [(825, 80, 1000, 475)])
    protected |= rectangles(shape, [(385, 680, 490, 800), (780, 475, 925, 600)])
    protected |= rectangles(shape, [(505, 215, 695, 410)])
    # Trace the rope rather than protecting a rectangular swath of the tunic.
    rope = polygon(shape, [(519, 538), (554, 552), (585, 558), (616, 558),
                           (664, 549), (707, 532), (727, 516), (726, 540),
                           (708, 557), (664, 576), (614, 589), (580, 589),
                           (547, 577), (520, 563)])
    rope |= polygon(shape, [(575, 583), (590, 590), (584, 610), (570, 649),
                            (568, 668), (551, 668), (550, 654), (560, 618)])
    rope |= polygon(shape, [(591, 584), (610, 589), (608, 641), (611, 670),
                            (590, 672), (588, 657)])
    protected |= rope
    green &= ~protected
    # Tunic and trousers only; never skin, beard, boots, rope or wooden staff.
    brown_area = rectangles(shape, [(470, 410, 790, 930), (435, 870, 590, 1000)])
    brown_area &= ~rectangles(shape, [(735, 420, 835, 515), (370, 525, 480, 625)])
    brown = material(rgba, hsv, "brown") & brown_area & ~protected
    assert not np.any(green & brown)
    return {"green": green, "brown": brown}


def transfer(source, reference):
    assert source.shape == reference.shape == (1254, 1254, 4)
    result = source.copy()
    source_hsv, reference_hsv = hsv_of(source), hsv_of(reference)
    masks = garment_masks(source, source_hsv)
    report = {}
    for name, regions in [("green", GREEN_SAMPLES), ("brown", BROWN_SAMPLES)]:
        sample_region = rectangles(source.shape[:2], regions)
        source_sample = sample_region & material(source, source_hsv, name)
        reference_sample = sample_region & material(reference, reference_hsv, name)
        mask = masks[name]
        assert min(source_sample.sum(), reference_sample.sum(), mask.sum()) > 1000

        # One lookup per input color preserves the existing pixel clusters. Match
        # hue, saturation and shade distributions using the original cloth only.
        colors, inverse = np.unique(source[:, :, :3][mask], axis=0, return_inverse=True)
        colors_hsv = np.asarray(Image.fromarray(colors[None, :, :]).convert("HSV"))[0]
        adjusted = np.empty_like(colors_hsv)
        for channel in range(3):
            source_values = source_hsv[:, :, channel][source_sample]
            ref_values = reference_hsv[:, :, channel][reference_sample]
            values, counts = np.unique(source_values, return_counts=True)
            percentiles = (np.cumsum(counts) - counts / 2) / counts.sum()
            probabilities = np.interp(colors_hsv[:, channel], values, percentiles)
            adjusted[:, channel] = np.rint(np.quantile(ref_values, probabilities)).astype(np.uint8)
        desired = np.asarray(Image.fromarray(adjusted[None, :, :], "HSV").convert("RGB"))[0]

        # Every resulting garment RGB is an actual color from the corresponding
        # material in Wanderer 01, not a generic yellow/sepia filter.
        palette = np.unique(reference[:, :, :3][reference_sample], axis=0)
        nearest = cKDTree(palette.astype(float)).query(desired.astype(float))[1]
        mapped = palette[nearest]
        result[:, :, :3][mask] = mapped[inverse]
        changed = np.any(result[:, :, :3] != source[:, :, :3], axis=2) & mask
        report[name] = {"selected": int(mask.sum()), "changed": int(changed.sum()),
                        "referenceColors": len(palette),
                        "inputMeanRGB": source[:, :, :3][mask].mean(axis=0).round(2).tolist(),
                        "outputMeanRGB": result[:, :, :3][mask].mean(axis=0).round(2).tolist()}
        used = np.unique(result[:, :, :3][mask], axis=0)
        assert set(map(tuple, used)).issubset(set(map(tuple, palette)))
    union = masks["green"] | masks["brown"]
    assert np.array_equal(result[:, :, 3], source[:, :, 3])
    assert np.array_equal(result[~union], source[~union])
    return result, report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, help="Uncorrected Basic image; default: approved Git revision")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--check", action="store_true", help="Verify the saved output without writing")
    args = parser.parse_args()
    baseline = args.input or io.BytesIO(subprocess.check_output(["git", "show", BASELINE], cwd=ROOT))
    source = np.asarray(Image.open(baseline).convert("RGBA"))
    reference = np.asarray(Image.open(REFERENCE).convert("RGBA"))
    corrected, report = transfer(source, reference)
    if args.check:
        assert np.array_equal(np.asarray(Image.open(args.output).convert("RGBA")), corrected)
        print("PASS: saved artwork matches the reproducible palette transfer")
    else:
        Image.fromarray(corrected).save(args.output)
        print(f"Saved {args.output.relative_to(ROOT) if args.output.is_relative_to(ROOT) else args.output}")
    for name, values in report.items():
        print(f"{name}: {values}")
