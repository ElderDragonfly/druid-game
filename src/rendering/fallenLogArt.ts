import Phaser from 'phaser';
import { FALLEN_LOGS, LOG_MUSHROOMS } from '../data/fallenLogs';
import { logPoint, type FallenLogPlacement } from '../world/fallenLogs';
const sources=import.meta.glob<string>('../../docs/art/fallen-logs-v1/{log,mushroom}-*.png',
  {eager:true,query:'?url',import:'default'});
export const FALLEN_LOG_ART=[...FALLEN_LOGS,...LOG_MUSHROOMS].map(art=>({
  key:art.id,url:sources[`../../docs/art/fallen-logs-v1/${art.file}`],
}));
export function drawFallenLog(scene: Phaser.Scene, log: FallenLogPlacement, index:number) {
  const art=FALLEN_LOGS[log.variant], depth=log.y+18;
  const image=scene.add.image(log.x,log.y,art.id).setScale(art.scale).setAngle(log.angle).setFlipX(log.flipX)
    .setName(`fallen-log-${index}`).setDepth(depth);
  const mushrooms=log.mushrooms.map((m,n)=>{
    const sprite=LOG_MUSHROOMS[m.variant], spot=art.mushroomSpots[m.slot], p=logPoint(log,spot[0],spot[1]);
    return scene.add.image(p.x,p.y,sprite.id).setOrigin(.5,1).setScale(sprite.scale)
      .setName(`log-mushroom-${index}-${n}`).setData('logIndex',index).setData('species',m.variant).setDepth(depth+.01+n*.001);
  });
  return [image,...mushrooms];
}
