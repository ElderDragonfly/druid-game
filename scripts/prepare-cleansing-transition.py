"""Reveal the approved clean tree in discrete pixel clusters, without warping."""
from pathlib import Path
import numpy as np
from PIL import Image
folder=Path(__file__).resolve().parents[1]/'docs/art/cleansing-tree-v1'
a=np.array(Image.open(folder/'corrupted.png').convert('RGBA'))
b=np.array(Image.open(folder/'cleansed.png').convert('RGBA'))
y,x=np.indices(a.shape[:2]);bx=x//3;by=y//3
# Living patches spread from the trunk outward, with an uneven block frontier.
noise=((bx*73856093)^(by*19349663))%997/997
rank=np.hypot((bx*3-50)/55,(by*3-79)/100)*.7+noise*.3
rank=(rank-rank.min())/(rank.max()-rank.min())
for step in range(1,7):
    out=np.where((rank<=step/7)[:,:,None],b,a).astype('uint8')
    Image.fromarray(out).save(folder/f'transition-{step}.png')
print('Prepared six pixel-cluster growth frames between the two approved trees.')
