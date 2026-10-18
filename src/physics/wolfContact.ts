import type Phaser from 'phaser';
import type { Druid } from '../entities/Druid';
import type { Rect } from '../world/meadowLayout';

export interface HorizontalContactPadding { left: number; right: number }

/** Screen-left/right cloak allowance; top and bottom stay at the feet body. */
export function wolfContactBounds(body: Rect, padding?: HorizontalContactPadding): Rect {
  return { x: body.x - (padding?.left ?? 0), y: body.y,
    width: body.width + (padding?.left ?? 0) + (padding?.right ?? 0), height: body.height };
}

/** Use Arcade's normal separation with a larger outline only for this pair.
 * Restore the tree/world footprint immediately after every physics step,
 * retaining any position/velocity correction made by the native solver.
 * No extra bodies, visual proxies or scene event listeners are needed.
 */
export function createDruidWolfCollider(scene: Phaser.Scene, player: Druid, wolf: Phaser.Physics.Arcade.Sprite) {
  const collider = scene.physics.add.collider(player, wolf);
  const update = collider.update.bind(collider);
  collider.update = () => {
    const body = player.body as Phaser.Physics.Arcade.Body;
    const contact = player.wolfContactBounds;
    const left = body.x - contact.x, sourceWidth = body.sourceWidth, sourceHeight = body.sourceHeight;
    const factor = contact.width / body.width, halfWidth = body.halfWidth, halfHeight = body.halfHeight;
    body.position.x -= left; body.prev.x -= left;
    body.setSize(sourceWidth * factor, sourceHeight, false);
    body.halfWidth = contact.width / 2; body.halfHeight = halfHeight; body.updateCenter();
    try { update(); }
    finally {
      body.position.x += left; body.prev.x += left;
      body.setSize(sourceWidth, sourceHeight, false);
      body.halfWidth = halfWidth; body.halfHeight = halfHeight; body.updateCenter();
    }
  };
  return collider;
}
