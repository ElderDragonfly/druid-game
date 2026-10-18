"""Crop separately drawn fire/water poses and pack exact PNG animation atlases.

No spatial warps or brightness/sine filters: drawings are in retained sources.
Only crop/registration, masks and palette matching are used during preparation.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import label, binary_dilation, distance_transform_edt
from scipy.spatial import cKDTree, ConvexHull

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/art/selection-camp-frames-v1'
COUNT, COLS = 8, 4
WATER_POLYGONS = [
 [(551,251),(567,257),(591,250),(610,253),(603,261),(580,264),(575,270),(589,271),(595,276),(568,278),(559,273),(563,266),(549,263)],
 [(571,276),(599,273),(587,307),(554,313),(556,305),(565,291)],
 [(543,313),(569,310),(552,327),(533,334),(543,340),(531,350),(514,354),(517,362),(538,361),(531,370),(505,367),(502,355),(519,346),(525,336),(533,331)],
 [(447,357),(483,358),(510,367),(534,367),(527,379),(492,383),(466,380),(414,383),(410,376),(450,370)],
]


def rgba(name): return Image.open(OUT / name).convert('RGBA')


def sheet_cells(source, columns, rows):
    return [source.crop((round(c*source.width/columns), round(r*source.height/rows),
                         round((c+1)*source.width/columns), round((r+1)*source.height/rows)))
            for r in range(rows) for c in range(columns)]


def pack(frames, name, fps):
    w,h = frames[0].size
    atlas = Image.new('RGBA',(w*COLS,h*2))
    for i,frame in enumerate(frames): atlas.paste(frame,(i%COLS*w,i//COLS*h))
    atlas.save(OUT / f'{name}-frames.png', optimize=True)
    atlas.save(OUT / f'{name}-keyframes.png', optimize=True)
    palette = atlas.convert('RGB').quantize(colors=256, dither=Image.Dither.NONE)
    gifs = [f.convert('RGB').quantize(palette=palette,dither=Image.Dither.NONE) for f in frames]
    gifs[0].save(OUT / f'{name}-preview.gif',save_all=True,append_images=gifs[1:],duration=round(1000/fps),loop=0,disposal=2,optimize=False)


def fire():
    reference = rgba('fire-reference.png'); original = np.array(reference)
    r,g,b,_ = np.moveaxis(original,-1,0); yy,xx = np.indices(r.shape)
    hot = (r>130)&(g>35)&(r>g*1.15)&(xx>=14)&(xx<=108)&(yy<125)
    points = np.column_stack(np.where(hot)[::-1])
    hull = points[ConvexHull(points).vertices]
    erase_image = Image.new('L', reference.size); ImageDraw.Draw(erase_image).polygon([tuple(p) for p in hull], fill=255)
    core = binary_dilation(np.array(erase_image)>0,iterations=2)&(yy<125)
    feather = np.clip((12-distance_transform_edt(~core))/12,0,1)
    edge = np.minimum.reduce([xx/5,(127-xx)/5,yy/5,(147-yy)/5,np.ones(xx.shape)])
    weight = feather*np.clip(edge,0,1)
    erase = weight > 0
    clean = np.array(rgba('fire-base-source.png').resize(reference.size,Image.Resampling.NEAREST))
    base = original.copy(); base[:,:,:3] = np.rint(original[:,:,:3]*(1-weight[:,:,None])+clean[:,:,:3]*weight[:,:,None]).astype('uint8')
    Image.fromarray(base).save(OUT/'fire-base.png',optimize=True)
    cells = sheet_cells(rgba('flame-source.png'),4,2)
    drawings = []; dimensions = []
    for cell in cells:
        data=np.array(cell); components,_=label(data[:,:,3]>=180,np.ones((3,3)))
        sizes=np.bincount(components.ravel()); sizes[0]=0; main=sizes.argmax()
        body = components==main; ys,xs=np.where(body)
        # Keep coherent drawn sparks, discard detached one-pixel matte speckles.
        keep=(sizes[components] >= sizes[main]*.006)&(components!=0)
        data[:,:,3]=keep*255; data[~keep]=0
        drawings.append((Image.fromarray(data), float(np.mean(xs[ys>=ys.max()-6])), int(ys.max())))
        dimensions.append((xs.max()-xs.min()+1,ys.max()-ys.min()+1))
    sx=72/np.median([d[0] for d in dimensions]); sy=94/np.median([d[1] for d in dimensions])
    frames=[]; union=erase.copy(); motion=np.zeros(erase.shape,dtype=bool)
    for pose,rootx,rooty in drawings:
        resized=pose.resize((round(pose.width*sx),round(pose.height*sy)),Image.Resampling.NEAREST)
        layer=Image.new('RGBA',reference.size)
        layer.paste(resized,(round(64-rootx*sx),round(120-rooty*sy)))
        a=np.array(layer); union |= a[:,:,3]>0; motion |= a[:,:,3]>0
        result=Image.fromarray(base); result.alpha_composite(layer); frames.append(result)
    Image.fromarray((union*255).astype('uint8')).save(OUT/'fire-change-mask.png')
    Image.fromarray((motion*255).astype('uint8')).save(OUT/'fire-motion-mask.png')
    for frame in frames: assert np.array_equal(np.array(frame)[~union],original[~union])
    pack(frames,'fire',25/6)
    return {'frameSize':list(reference.size),'fps':25/6,'frames':8,'fixedRoot':[64,120],
            'sourceGrid':[4,2],'registrationScale':[sx,sy],'outsideMaskExact':True}


def water():
    reference=rgba('water-reference.png'); original=np.array(reference)
    image=Image.new('L',reference.size); draw=ImageDraw.Draw(image)
    for polygon in WATER_POLYGONS: draw.polygon([(x-408,y-245)for x,y in polygon],fill=255)
    r,g,b,_=np.moveaxis(original.astype(float),-1,0)
    mask=(np.array(image)>0)&(b>25)&(g>15)&(b>r*1.08)&(g>r*1.12)
    Image.fromarray((mask*255).astype('uint8')).save(OUT/'water-change-mask.png')
    palette=np.unique(original[:,:,:3][mask],axis=0); colors=cKDTree(palette.astype(float))
    frames=[]
    for cell in sheet_cells(rgba('water-source.png'),2,4):
        drawing=np.array(cell.resize(reference.size,Image.Resampling.NEAREST))
        rgb=drawing[:,:,:3].astype(float); r,g,b=np.moveaxis(rgb,-1,0)
        selected=mask&(b>25)&(g>15)&(b>r*1.08)&(g>r*1.12)
        data=original.copy(); _,nearest=colors.query(rgb[selected]); data[:,:,:3][selected]=palette[nearest]
        assert np.array_equal(data[~mask],original[~mask])
        frames.append(Image.fromarray(data))
    pack(frames,'water',8)
    return {'frameSize':list(reference.size),'fps':8,'frames':8,'sourceGrid':[2,4],'outsideMaskExact':True}


if __name__=='__main__':
    metadata={'atlasColumns':4,'fire':fire(),'water':water(),'runtime':'PNG frame switching only; no deformation'}
    (OUT/'art.json').write_text(json.dumps(metadata,indent=2)+'\n')
