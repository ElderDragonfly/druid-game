import Phaser from 'phaser';
import { MENU_LAYOUT } from './layout';

export function fitMenuCamera(scene: Phaser.Scene) {
  const fit = () => {
    const zoom = Math.min(scene.scale.width / 960, scene.scale.height / 640);
    scene.cameras.main.setZoom(zoom).centerOn(480, 320);
  };
  fit();
  scene.scale.on(Phaser.Scale.Events.RESIZE, fit);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, fit));
}

export function addCampBackground(scene: Phaser.Scene, texture: string, pixelScale = 1) {
  const b = MENU_LAYOUT.background;
  let background: Phaser.GameObjects.Image | Phaser.GameObjects.RenderTexture;
  if (pixelScale > 1) {
    // Только фон рисуем в меньшем разрешении, затем увеличиваем без сглаживания.
    // Текст, кнопки и персонаж сохраняют свою чёткость и отдельные слои.
    const width = Math.round(b.width / pixelScale);
    const height = Math.round(b.height / pixelScale);
    const source = scene.make.image({ key: texture, x: width / 2, y: height / 2, add: false })
      .setDisplaySize(width, height);
    const rendered = scene.add.renderTexture(b.x, b.y, width, height);
    rendered.draw(source);
    source.destroy();
    rendered.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    background = rendered.setDisplaySize(b.width, b.height).setName('camp-background').setData('sourceTexture', texture);
  } else {
    background = scene.add.image(b.x, b.y, texture).setDisplaySize(b.width, b.height).setName('camp-background').setData('sourceTexture', texture);
  }
  markMenuScenery(scene,[background]);
  scene.input.setDefaultCursor('default');
}

/** Newly selected characters/props keep using the background camera too. */
export function markMenuScenery(scene: Phaser.Scene, objects: Phaser.GameObjects.GameObject[]) {
  for(const object of objects)object.setData('menu-scenery',true);
  scene.cameras.getCamera('menu-ui')?.ignore(objects);
}

/** Cover the window with the intact camp layers, and fit UI independently so
 * wide/short windows never crop the character cards or navigation buttons. */
export function setupMenuCameras(scene: Phaser.Scene) {
  const background=scene.cameras.main.setName('menu-background');
  const ui=scene.cameras.add(0,0,scene.scale.width,scene.scale.height).setName('menu-ui');
  const scenery=scene.children.list.filter(object=>object.getData('menu-scenery'));
  background.ignore(scene.children.list.filter(object=>!object.getData('menu-scenery')));
  ui.ignore(scenery);
  const resize=()=>{
    const {width,height}=scene.scale,b=MENU_LAYOUT.background;
    const zoom=Math.max(width/b.width,height/b.height),viewWidth=width/zoom;
    // Narrow windows favour the seated druid/staff near the right edge.
    const centerX=b.x+Math.max(0,(b.width-viewWidth)/2-20);
    background.setSize(width,height).setZoom(zoom).centerOn(centerX,b.y);
    ui.setSize(width,height).setZoom(Math.min(width/960,height/640)).centerOn(480,320);
  };
  resize();scene.scale.on(Phaser.Scale.Events.RESIZE,resize);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>scene.scale.off(Phaser.Scale.Events.RESIZE,resize));
}

export function bindSceneKey(scene: Phaser.Scene, event: string, action: () => void) {
  const keyboard = scene.input.keyboard!;
  keyboard.on(event, action);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.off(event, action));
}

export function addMenuHint(scene: Phaser.Scene, text: string) {
  scene.add.text(480, 614, text, {
    fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#9bac93',
  }).setOrigin(0.5);
}
