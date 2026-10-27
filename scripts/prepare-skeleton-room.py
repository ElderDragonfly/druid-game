"""Mechanical contour cuts: original RGB and enclosed pixels stay untouched."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import binary_fill_holes, label

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'docs/art'
OUT = ART / 'skeleton-room-v1'
OUT.mkdir(exist_ok=True)

def cut(image, background, largest=False):
    rgb = np.array(image.convert('RGB'))
    keep = ~background(rgb.astype(int))
    if largest:
        labels, _ = label(keep)
        sizes = np.bincount(labels.ravel()); sizes[0] = 0
        keep = labels == sizes.argmax()
    keep = binary_fill_holes(keep)
    rgba = np.dstack((rgb, keep.astype('uint8') * 255))
    return Image.fromarray(rgba)

gif = Image.open(ART / 'f60208be679177cf429000b0cdd76103.gif')
metadata = {'width': 256, 'height': 288, 'feetX': 125, 'feetY': 248,
            'source': gif.filename.split('/')[-1], 'exteriorOnly': True, 'animations': {}}
for name, left, right in [('idle', 0, 250), ('attack', 250, 500), ('walk', 500, 749)]:
    frames, durations = [], []
    # All three figures repeat every 16 frames. Skip the GIF's opening hold;
    # start the attack before its wind-up so one gameplay attack is one swing.
    indices = list(range(11,27)) if name == 'attack' else list(range(1,17))
    for i in indices:
        gif.seek(i)
        frame = cut(gif.crop((left, 0, right, 286)),
                    lambda a: (a.max(2)-a.min(2) <= 10) & (a.max(2) < 150))
        # Retain the common source ground line; never align each moving foot.
        cell = Image.new('RGBA', (256, 288)); cell.paste(frame, (0, 0))
        frames.append(cell); durations.append(gif.info.get('duration', 30))
    sheet = Image.new('RGBA', (256 * len(frames), 288))
    for i, frame in enumerate(frames): sheet.paste(frame, (i * 256, 0))
    sheet.save(OUT / f'{name}.png')
    frames[0].save(OUT / f'{name}-first.png')
    frames[0].save(OUT / f'{name}-preview.gif', save_all=True, append_images=frames[1:],
                   duration=durations, loop=0, disposal=2)
    metadata['animations'][name] = {'durations': durations, 'sourceFrames':indices,
        'sourceCrop': [left, 0, right, 286]}
(OUT / 'animations.json').write_text(json.dumps(metadata, indent=2)+'\n')

source = Image.open(ART / 'a8513c12928f616c41a84655e98e2aa5.jpg')
boxes = [(68,48,198,129),(163,94,331,183),(333,23,568,168),
         (55,179,164,276),(168,182,333,292),(353,182,421,243),
         (414,208,501,314),(495,176,621,244),(353,247,420,307)]
sprites = []
for i, box in enumerate(boxes):
    frame = cut(source.crop(box), lambda a: np.max(abs(a-np.array([167,153,127])),2) < 24, largest=True)
    bounds = frame.getbbox(); frame = frame.crop(bounds)
    frame.save(OUT / f'bones-{i}.png')
    sprites.append({'width':frame.width,'height':frame.height,
                    'sourceCrop':[box[0]+bounds[0],box[1]+bounds[1],box[0]+bounds[2],box[1]+bounds[3]]})
(OUT / 'bones.json').write_text(json.dumps({'source':source.filename.split('/')[-1],
    'exteriorOnly':True,'preservesOpaqueRGB':True,'sprites':sprites},indent=2)+'\n')
print(f'Extracted 16 frames × 3 animations and {len(sprites)} bone variants')
