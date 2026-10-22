import Phaser from 'phaser';
import { FALLEN_LOGS, LOG_MUSHROOMS } from '../data/fallenLogs';
import { logCollisionRects, mushroomPoint, type FallenLogPlacement } from '../world/fallenLogs';
const sources=import.meta.glob<string>('../../docs/art/{fallen-logs-v2,log-mushrooms-v3}/{log,mushroom}-*.png',
  {eager:true,query:'?url',import:'default'});
export const FALLEN_LOG_ART=[...FALLEN_LOGS,...LOG_MUSHROOMS].map(art=>({
  key:art.id,url:sources[`../../docs/art/${art.id.startsWith('log-') ? 'fallen-logs-v2' : 'log-mushrooms-v3'}/${art.file}`],
}));
export function drawFallenLog(scene: Phaser.Scene, log: FallenLogPlacement, index:number) {
  const art=FALLEN_LOGS[log.variant], depth=Math.max(...logCollisionRects(log).map(rect=>rect.y+rect.height));
  const image=scene.add.image(log.x,log.y,art.id).setScale(art.scale).setAngle(log.angle).setFlipX(false)
    .setName(`fallen-log-${index}`).setDepth(depth);
  const mushrooms=log.mushrooms.map(m=>{
    const sprite=LOG_MUSHROOMS[m.variant], p=mushroomPoint(log,m);
    return scene.add.image(p.x,p.y,sprite.id).setOrigin(.5,1).setScale(sprite.scale)
      .setName(`log-mushroom-${index}-${m.slot}`).setData('logIndex',index).setData('species',m.variant).setData('mushroomSlot',m.slot).setDepth(depth+1+(p.y-log.y)*.001);
  });
  return [image,...mushrooms];
}
