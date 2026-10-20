import { drawFallenLog } from '../rendering/fallenLogArt';
import { logCollisionRects } from './fallenLogs';
import Phaser from 'phaser';
import { Wolf } from '../entities/Wolf';
import type { Druid } from '../entities/Druid';
import { WolfNavigation } from './WolfNavigation';
import { generateWolfPopulation } from './wolfPopulation';
import { segmentTouchesEllipse } from '../physics/ellipse';
import type { Point } from '../physics/projectileSweep';
import { WOLF } from '../data/wolf';
import { environmentVariant } from '../data/environment';
import { MEADOW_PALETTE, PixelArt } from '../rendering/pixelArt';
import { drawForestFloor } from '../rendering/forestFloor';
import { FOREST_FLOOR } from './forestFloor';
import { obstacleRect, type MeadowLayout } from './meadowLayout';
import { GrassForeground } from '../rendering/GrassForeground';
import { Mouse } from '../entities/Mouse';
import { generateMousePopulation } from './mousePopulation';
import type { WorldSave } from '../persistence/snapshots';

export class MeadowWorld {
  readonly obstacles: Phaser.Physics.Arcade.StaticGroup;
  readonly mice: readonly Mouse[];
  readonly wolves: Wolf[] = [];
  readonly corpses: Wolf[] = [];
  private logArt: Phaser.GameObjects.Image[] = [];
  private floor: Phaser.GameObjects.RenderTexture;
  private collider?: Phaser.Physics.Arcade.Collider;
  private grass: GrassForeground;
  private player?: Druid;

  constructor(private scene: Phaser.Scene, readonly layout: MeadowLayout, private readonly saved?: WorldSave) {
    const surface = this.drawFloor();
    this.floor = surface.floor;
    this.grass = new GrassForeground(scene, surface.raster);
    this.obstacles = scene.physics.add.staticGroup();
    layout.obstacles.forEach((object, index) => {
      const art = environmentVariant(object.kind, object.variant);
      const image = this.obstacles.create(object.x, object.y, art.texture, art.frame) as Phaser.Physics.Arcade.Image;
      image.setName(`obstacle-${index}`).setData('kind', object.kind).setOrigin(art.anchorX / art.width, art.anchorY / art.height)
        .setScale(art.scale).setDepth(object.y);
      image.refreshBody();
      const body = image.body as Phaser.Physics.Arcade.StaticBody;
      const bounds = obstacleRect(object), topLeft = image.getTopLeft();
      // Physics and generation/pathfinding share the same trimmed trunk.
      body.setSize(bounds.width, bounds.height, false)
        .setOffset(bounds.x - topLeft.x, bounds.y - topLeft.y);
    });
    (layout.logs??[]).forEach((log,index)=>{
      this.logArt.push(...drawFallenLog(scene,log,index));
      logCollisionRects(log).forEach((bounds,part)=>{
        const proxy=this.obstacles.create(bounds.x,bounds.y,'__WHITE') as Phaser.Physics.Arcade.Image;
        proxy.setName(`fallen-log-collider-${index}-${part}`).setData('kind','log').setOrigin(0)
          .setDisplaySize(bounds.width,bounds.height).setVisible(false).refreshBody();
      });
    });
    this.mice = (saved?.mice ?? generateMousePopulation(layout)).map((start, index) => {
      const mouse = new Mouse(scene, layout, this.obstacles, start, index + 1);
      if (saved) mouse.restore(saved.mice[index]);
      return mouse;
    });
  }

  bindPlayer(player: Druid) {
    this.player = player;
    this.collider = this.scene.physics.add.collider(player, this.obstacles);
    const navigation = new WolfNavigation(this.layout);
    (this.saved?.wolves ?? generateWolfPopulation(navigation)).forEach((start,index)=> {
      const wolf = new Wolf(this.scene,navigation,this.obstacles,player,start,index+1);
      const saved = this.saved?.wolves[index];
      if (saved) wolf.restore(saved);
      (saved?.corpse ? this.corpses : this.wolves).push(wolf);
    });
  }

  noticeProjectile(from: Point,to: Point) {
    for(const wolf of this.wolves) {
      if(!wolf.active||wolf.dying||!wolf.body?.enable||wolf.actorState.alerted)continue;
      if(segmentTouchesEllipse(from,to,(wolf.body as Phaser.Physics.Arcade.Body).center,
        WOLF.behavior.projectileDetectionX,WOLF.behavior.projectileDetectionY))wolf.behavior.alert();
    }
  }

  updateGrass(footX: number, footY: number, depth: number) {
    this.grass.update(footX, footY, depth);
  }

  update(delta: number) {
    if(this.player?.dead)return;
    this.mice.forEach(mouse => mouse.updateBehavior(delta));
    for(let index=this.wolves.length-1;index>=0;index--) {
      if(this.player?.dead)break;
      const wolf=this.wolves[index];wolf.updateBehavior(delta);
      if(wolf.deathFinished) {
        wolf.setActive(false).setName('wolf-corpse');
        wolf.shadow.setName('wolf-corpse-shadow');
        this.corpses.push(wolf);
        this.wolves.splice(index,1);
      }
    }
  }

  destroy() {
    this.wolves.forEach(wolf=>wolf.destroy());this.wolves.length=0;
    this.corpses.forEach(wolf=>wolf.destroy());this.corpses.length=0;
    this.mice.forEach(mouse => mouse.destroy());
    this.collider?.destroy();
    this.obstacles.clear(true, true);
    this.obstacles.destroy();
    this.logArt.forEach(image=>image.destroy());this.logArt=[];
    this.floor.destroy();
    this.grass.destroy();
  }

  snapshot(): WorldSave {
    return { mice: this.mice.map(mouse => mouse.snapshot()),
      wolves: [...this.wolves.map(wolf => wolf.snapshot()), ...this.corpses.map(wolf => wolf.snapshot(true))] };
  }

  private drawFloor() {
    const scale = FOREST_FLOOR.pixelScale;
    const surface = drawForestFloor(this.scene, this.layout);
    const g = this.scene.add.graphics();
    const p = new PixelArt(g);
    for (const object of this.layout.obstacles) {
      const size = environmentVariant(object.kind, object.variant);
      p.ellipse(MEADOW_PALETTE.forestShadow, Math.round(object.x / scale + 4), Math.round(object.y / scale - 2),
        size.bodyWidth / scale * 0.7, size.bodyHeight / scale * 0.45);
    }
    surface.floor.draw(g);
    g.destroy();
    return surface;
  }
}
