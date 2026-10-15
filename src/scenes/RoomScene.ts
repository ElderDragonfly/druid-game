import Phaser from 'phaser';
import { Druid } from '../entities/Druid';
import { CHARACTERS } from '../data/characters';
import { SCENES } from './keys';
import { bindSceneKey } from '../ui/sceneHelpers';
import { MeadowWorld } from '../world/MeadowWorld';
import { generateMeadow, MEADOW_WORLD, MEADOW_PIXEL_SCALE, type MeadowLayout } from '../world/meadowLayout';
import { EllipticalFollowCamera } from '../camera/EllipticalFollowCamera';
import { FourWayFacing, type Facing, type MovementKeys } from '../input/FourWayFacing';

export class RoomScene extends Phaser.Scene {
  player!: Druid;
  get playerHealth() { return this.player.actorState.health; }
  characterId = CHARACTERS[0].id;
  layout!: MeadowLayout;
  world!: MeadowWorld;
  private seed = 0;
  private movement!: MovementKeys;
  private facingInput!: FourWayFacing;
  facing: Facing = 'down';
  private shadow!: Phaser.GameObjects.Image;
  private hud!: Phaser.GameObjects.Container;
  private hudCamera!: Phaser.Cameras.Scene2D.Camera;
  private hint!: Phaser.GameObjects.Text;
  private cameraFollow!: EllipticalFollowCamera;
  private feetOffset = 0;

  constructor() { super(SCENES.room); }

  init(data: { characterId?: string; seed?: number } = {}) {
    this.characterId = (CHARACTERS.find(item => item.available && item.id === data.characterId) ?? CHARACTERS[0]).id;
    this.seed = data.seed ?? Math.floor(Math.random() * 0x100000000);
  }

  create() {
    this.physics.resume();
    const character = CHARACTERS.find(item => item.id === this.characterId)!;
    const appearance = character.game ?? CHARACTERS[0].game!;
    const art = appearance.metrics;
    this.facing = 'down';
    this.feetOffset = art.bodyCenterY + art.bodyHeight / 2;
    this.player = new Druid(this, character);
    this.shadow = this.add.image(0, 0, 'meadow-druid-shadow').setScale(MEADOW_PIXEL_SCALE).setAlpha(0.6);
    this.buildWorld();

    const keyboard = this.input.keyboard!;
    this.movement = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as typeof this.movement;
    this.facingInput = new FourWayFacing(this.movement);
    // Arcade syncs sprite coordinates in post-update; sample grass after that sync.
    const updateGrass = (_time: number, delta: number) => {
      this.world.update(delta);
      this.world.updateGrass(this.player.x, this.player.y + this.feetOffset, this.player.depth);
    };
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, updateGrass);
    bindSceneKey(this, 'keyup-ESC', () => this.scene.start(SCENES.characterSelect));
    bindSceneKey(this, 'keyup-R', () => this.scene.restart({ characterId: this.characterId }));
    const resetInput = () => { keyboard.resetKeys(); this.player.setVelocity(0, 0); this.player.updateAppearance(true); };
    this.game.events.on(Phaser.Core.Events.BLUR, resetInput);
    const resize = () => this.resizeCameras();
    this.scale.on(Phaser.Scale.Events.RESIZE, resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.facingInput.destroy();
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, updateGrass);
      this.game.events.off(Phaser.Core.Events.BLUR, resetInput);
      this.scale.off(Phaser.Scale.Events.RESIZE, resize);
    });
  }

  update(_time: number, delta: number) {
    const keys = this.movement;
    this.facing = this.facingInput.read();
    this.player.move(Number(keys.right.isDown) - Number(keys.left.isDown),
      Number(keys.down.isDown) - Number(keys.up.isDown), this.facing);
    this.player.setDepth(this.player.y + 25);
    this.shadow.setPosition(this.player.x, this.player.y + 22).setDepth(this.player.y + 24);
    const center = this.cameraFollow.update(this.player.x, this.player.y, delta);
    this.cameras.main.centerOn(center.x, center.y);
  }

  private buildWorld() {
    this.layout = generateMeadow(this.seed);
    const { width, height, cameraRadiusX, cameraRadiusY, cameraResponseMs } = MEADOW_WORLD;
    this.physics.world.setBounds(0, 0, width, height);
    this.cameras.main.setBounds(0, 0, width, height);
    this.cameraFollow = new EllipticalFollowCamera(width, height, cameraRadiusX, cameraRadiusY, cameraResponseMs);
    this.world = new MeadowWorld(this, this.layout);
    this.world.bindPlayer(this.player);
    const position = this.layout.spawn;
    (this.player.body as Phaser.Physics.Arcade.Body).reset(position.x, position.y);
    this.drawHud();
    // A separate unzoomed camera keeps HP and hints attached to the screen.
    this.hudCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height).setName('hud');
    this.cameras.main.ignore(this.hud);
    this.hudCamera.ignore(this.children.list.filter(object => object !== this.hud));
    this.resizeCameras();
  }

  private resizeCameras() {
    const { width, height } = this.scale;
    const zoom = Math.max(height / MEADOW_WORLD.viewHeight, width / MEADOW_WORLD.width);
    this.cameras.main.setSize(width, height).setZoom(zoom);
    this.cameraFollow.resize(width / zoom, height / zoom);
    const { x, y } = this.cameraFollow.center;
    this.cameras.main.centerOn(x, y);
    this.hudCamera.setSize(width, height);
    this.hint.setY(height - 22);
  }

  private drawHud() {
    this.hud = this.add.container(0, 0).setDepth(100000);
    const panel = this.add.rectangle(16, 16, 176, 44, 0x132419, 0.85).setOrigin(0);
    const label = this.add.text(28, 30, `HP ${this.playerHealth}/${this.player.actorState.maxHealth}`, {
      fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#dfdfbd',
    }).setName('health-label');
    const hearts = this.add.graphics();
    for (let i = 0; i < this.playerHealth; i++) {
      const x = 104 + i * 26;
      hearts.fillStyle(0xd98278).fillCircle(x - 4, 35, 5).fillCircle(x + 4, 35, 5).fillTriangle(x - 9, 36, x + 9, 36, x, 47);
    }
    this.hint = this.add.text(20, this.scale.height - 22, 'WASD — движение · R — новая поляна · Esc — в лагерь', {
      fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#d3dcba', backgroundColor: '#1b2c20', padding: { x: 8, y: 4 },
    }).setOrigin(0, 1);
    this.hud.add([panel, label, hearts, this.hint]);
  }
}
