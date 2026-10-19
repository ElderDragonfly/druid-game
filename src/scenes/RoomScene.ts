import Phaser from 'phaser';
import { Druid } from '../entities/Druid';
import { CHARACTERS } from '../data/characters';
import { SCENES } from './keys';
import { bindSceneKey } from '../ui/sceneHelpers';
import { MeadowWorld } from '../world/MeadowWorld';
import { generateMeadow, MEADOW_WORLD, MEADOW_PIXEL_SCALE, type MeadowLayout } from '../world/meadowLayout';
import { EllipticalFollowCamera } from '../camera/EllipticalFollowCamera';
import { facingFromVector, type Facing, type MovementKeys } from '../input/EightWayFacing';
import { AcornAttack } from '../world/AcornAttack';
import { COMBAT_EVENTS } from '../combat/events';
import { DeathOverlay } from '../ui/DeathOverlay';
import { clearRun, saveRun } from '../persistence/runSave';
import type { RunSave } from '../persistence/snapshots';
import { menuMusic } from '../audio/MenuMusic';

export class RoomScene extends Phaser.Scene {
  player!: Druid;
  get playerHealth() { return this.player.actorState.health; }
  characterId = CHARACTERS[0].id;
  layout!: MeadowLayout;
  world!: MeadowWorld;
  acorns!: AcornAttack;
  gameOver = false;
  private seed = 0;
  private movement!: MovementKeys;
  private attackKeys!: MovementKeys;
  private queuedAttack?: Facing;
  facing: Facing = 'down';
  private shadow!: Phaser.GameObjects.Image;
  private hud!: Phaser.GameObjects.Container;
  private hudCamera!: Phaser.Cameras.Scene2D.Camera;
  private hint!: Phaser.GameObjects.Text;
  private cameraFollow!: EllipticalFollowCamera;
  private feetOffset = 0;
  private healthLabel!: Phaser.GameObjects.Text;
  private hearts!: Phaser.GameObjects.Graphics;
  private deathOverlay!: DeathOverlay;
  private savedRun?: RunSave;

  constructor() { super(SCENES.room); }

  init(data: { characterId?: string; seed?: number; savedRun?: RunSave } = {}) {
    this.savedRun = data.savedRun;
    if (this.savedRun) data = { ...data, characterId: this.savedRun.characterId, seed: this.savedRun.layout.seed };
    this.characterId = (CHARACTERS.find(item => item.available && item.id === data.characterId) ?? CHARACTERS[0]).id;
    this.seed = data.seed ?? Math.floor(Math.random() * 0x100000000);
  }

  create() {
    menuMusic(this.game).setInMenu(false);
    if (!this.savedRun) clearRun();
    this.physics.resume();
    this.gameOver = false;
    const character = CHARACTERS.find(item => item.id === this.characterId)!;
    const appearance = character.game ?? CHARACTERS[0].game!;
    const art = appearance.metrics;
    this.facing = 'down';
    this.queuedAttack = undefined;
    this.feetOffset = art.bodyCenterY + art.bodyHeight / 2;
    this.player = new Druid(this, character);
    this.shadow = this.add.image(0, 0, 'meadow-druid-shadow').setScale(MEADOW_PIXEL_SCALE).setAlpha(0.6);
    this.buildWorld();
    this.acorns = new AcornAttack(this,this.player,Math.random,(from,to)=>this.world.noticeProjectile(from,to));
    if (this.savedRun) this.acorns.restore(this.savedRun.shots);
    this.player.on(COMBAT_EVENTS.healthChanged,this.updateHealth,this);
    this.player.once(COMBAT_EVENTS.died,this.endGame,this);

    const keyboard = this.input.keyboard!;
    this.movement = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as typeof this.movement;
    this.attackKeys = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP, down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT, right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    }) as MovementKeys;
    const captureArrowTap = (event: KeyboardEvent) => {
      if(this.gameOver)return;
      if (!event.code.startsWith('Arrow') || event.repeat) return;
      const arrows = this.attackKeys;
      this.queuedAttack = facingFromVector(Number(arrows.right.isDown) - Number(arrows.left.isDown),
        Number(arrows.down.isDown) - Number(arrows.up.isDown));
    };
    keyboard.on('keydown', captureArrowTap);
    // Arcade syncs sprite coordinates in post-update; sample grass after that sync.
    const updateGrass = (_time: number, delta: number) => {
      if(this.gameOver)return;
      this.player.syncCastVisual();
      this.world.update(delta);
      if(this.gameOver)return;
      this.acorns.update(delta);
      this.world.updateGrass(this.player.x, this.player.y + this.feetOffset, this.player.depth);
    };
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, updateGrass);
    bindSceneKey(this, 'keyup-ESC', () => this.leaveRun());
    bindSceneKey(this, 'keyup-R', () => this.scene.restart({ characterId: this.characterId }));
    const resetInput = () => {
      keyboard.resetKeys(); this.queuedAttack = undefined;
      if(this.gameOver)return;
      this.player.cancelHit(); this.player.cancelCast();
      this.player.setVelocity(0, 0); this.player.updateAppearance(true);
    };
    this.game.events.on(Phaser.Core.Events.BLUR, resetInput);
    const resize = () => this.resizeCameras();
    this.scale.on(Phaser.Scale.Events.RESIZE, resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.acorns.destroy();
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, updateGrass);
      this.game.events.off(Phaser.Core.Events.BLUR, resetInput);
      this.scale.off(Phaser.Scale.Events.RESIZE, resize);
      keyboard.off('keydown', captureArrowTap);
    });
  }

  update(_time: number, delta: number) {
    if(this.gameOver)return;
    const keys = this.movement;
    const x = Number(keys.right.isDown) - Number(keys.left.isDown);
    const y = Number(keys.down.isDown) - Number(keys.up.isDown);
    const arrows = this.attackKeys;
    const attack = facingFromVector(Number(arrows.right.isDown) - Number(arrows.left.isDown),
      Number(arrows.down.isDown) - Number(arrows.up.isDown)) ?? this.queuedAttack;
    this.queuedAttack = undefined;
    this.player.updateCasting(delta, attack);
    this.player.move(x, y, facingFromVector(x, y) ?? this.player.actorState.facing);
    this.facing = this.player.actorState.facing;
    this.player.setDepth(this.player.y + 25);
    this.player.syncCastVisual();
    this.shadow.setPosition(this.player.x, this.player.y + 22).setDepth(this.player.y + 24);
    const center = this.cameraFollow.update(this.player.x, this.player.y, delta);
    this.cameras.main.centerOn(center.x, center.y);
  }

  private buildWorld() {
    this.layout = this.savedRun?.layout ?? generateMeadow(this.seed);
    const { width, height, cameraRadiusX, cameraRadiusY, cameraResponseMs } = MEADOW_WORLD;
    this.physics.world.setBounds(0, 0, width, height);
    this.cameras.main.setBounds(0, 0, width, height);
    this.cameraFollow = new EllipticalFollowCamera(width, height, cameraRadiusX, cameraRadiusY, cameraResponseMs);
    if (this.savedRun) Object.assign(this.cameraFollow.center, this.savedRun.camera);
    this.world = new MeadowWorld(this, this.layout, this.savedRun?.world);
    this.world.bindPlayer(this.player);
    const position = this.layout.spawn;
    (this.player.body as Phaser.Physics.Arcade.Body).reset(position.x, position.y);
    if (this.savedRun) { this.player.restore(this.savedRun.player); this.facing = this.player.actorState.facing; }
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
    this.deathOverlay.resize(width,height);
  }

  private drawHud() {
    this.hud = this.add.container(0, 0).setDepth(100000);
    const panel = this.add.rectangle(16, 16, 176, 44, 0x132419, 0.85).setOrigin(0);
    this.healthLabel = this.add.text(28, 30, '', {
      fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#dfdfbd',
    }).setName('health-label');
    this.hearts = this.add.graphics();this.updateHealth();
    this.hint = this.add.text(20, this.scale.height - 22, 'WASD — движение · Стрелки — жёлудь (8 направлений) · R — новая поляна · Esc — сохранить и выйти', {
      fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#d3dcba', backgroundColor: '#1b2c20', padding: { x: 8, y: 4 },
    }).setOrigin(0, 1);
    this.deathOverlay = new DeathOverlay(this);
    this.hud.add([panel, this.healthLabel, this.hearts, this.hint, this.deathOverlay]);
  }

  private updateHealth() {
    this.healthLabel.setText(`HP ${this.playerHealth}/${this.player.actorState.maxHealth}`);
    this.hearts.clear();
    for(let i=0;i<this.player.actorState.maxHealth;i++) {
      const x=104+i*26;
      this.hearts.fillStyle(i<this.playerHealth?0xd98278:0x465140)
        .fillCircle(x-4,35,5).fillCircle(x+4,35,5).fillTriangle(x-9,36,x+9,36,x,47);
    }
  }

  private endGame() {
    if(this.gameOver)return;
    this.gameOver=true;this.queuedAttack=undefined;clearRun();
    this.player.cancelCast();this.player.setVelocity(0,0);
    for(const wolf of this.world.wolves)wolf.setVelocity(0,0);
    for(const mouse of this.world.mice)mouse.setVelocity(0,0);
    this.physics.pause();this.deathOverlay.show();
  }

  private leaveRun() {
    if (this.gameOver || this.player.dead) { this.scene.start(SCENES.characterSelect); return; }
    const persistent = saveRun({ version: 1, savedAt: Date.now(), characterId: this.characterId,
      layout: this.layout, player: this.player.snapshot(), camera: { ...this.cameraFollow.center },
      world: this.world.snapshot(), shots: this.acorns.snapshot() });
    this.input.keyboard?.resetKeys();
    this.scene.start(SCENES.mainMenu, { sessionOnlySave: !persistent });
  }
}
