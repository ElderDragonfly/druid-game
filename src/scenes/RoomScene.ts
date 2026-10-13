import Phaser from 'phaser';
import { SETTINGS } from '../settings';
import { CHARACTERS } from '../data/characters';
import { SCENES } from './keys';
import { bindSceneKey } from '../ui/sceneHelpers';
import { MeadowWorld } from '../world/MeadowWorld';
import { generateMeadow, obstacleRect, overlaps, type MeadowLayout } from '../world/meadowLayout';
import { createMeadowTextures } from '../rendering/meadowTextures';

export class RoomScene extends Phaser.Scene {
  player!: Phaser.Physics.Arcade.Image;
  playerHealth: number = SETTINGS.playerHealth;
  characterId = CHARACTERS[0].id;
  layout!: MeadowLayout;
  world!: MeadowWorld;
  private seed = 0;
  private movement!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private direction = new Phaser.Math.Vector2();
  private shadow!: Phaser.GameObjects.Ellipse;
  private hud!: Phaser.GameObjects.Container;

  constructor() { super(SCENES.room); }

  init(data: { characterId?: string; seed?: number } = {}) {
    this.characterId = (CHARACTERS.find(item => item.available && item.id === data.characterId) ?? CHARACTERS[0]).id;
    this.seed = data.seed ?? Math.floor(Math.random() * 0x100000000);
  }

  create() {
    this.playerHealth = SETTINGS.playerHealth;
    this.physics.resume();
    createMeadowTextures(this);
    this.player = this.physics.add.image(0, 0, 'meadow-druid').setScale(2.5)
      .setSize(8, 10).setOffset(4, 9).setCollideWorldBounds(true);
    this.shadow = this.add.ellipse(0, 0, 34, 12, 0x172a1d, 0.4);
    this.buildWorld();

    const keyboard = this.input.keyboard!;
    this.movement = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as typeof this.movement;
    bindSceneKey(this, 'keyup-ESC', () => this.scene.start(SCENES.characterSelect));
    bindSceneKey(this, 'keyup-R', () => this.scene.restart({ characterId: this.characterId }));
    const resetInput = () => { keyboard.resetKeys(); this.player.setVelocity(0, 0); };
    this.game.events.on(Phaser.Core.Events.BLUR, resetInput);
    const resize = () => this.buildWorld(true);
    this.scale.on(Phaser.Scale.Events.RESIZE, resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, resetInput);
      this.scale.off(Phaser.Scale.Events.RESIZE, resize);
    });
  }

  update() {
    const keys = this.movement;
    this.direction.set(Number(keys.right.isDown) - Number(keys.left.isDown), Number(keys.down.isDown) - Number(keys.up.isDown))
      .normalize().scale(SETTINGS.playerSpeed);
    this.player.setVelocity(this.direction.x, this.direction.y).setDepth(this.player.y + 25);
    this.shadow.setPosition(this.player.x, this.player.y + 22).setDepth(this.player.y + 24);
  }

  private buildWorld(preservePosition = false) {
    const zoom = this.scale.width / SETTINGS.width;
    const width = SETTINGS.width;
    const height = this.scale.height / zoom;
    const previousHeight = this.layout?.height;
    const old = { x: this.player.x, y: this.player.y };
    if (preservePosition) { this.world.destroy(); this.hud.destroy(); }
    this.layout = generateMeadow(width, height, this.seed);
    this.physics.world.setBounds(0, 0, width, height);
    this.cameras.main.setZoom(zoom).centerOn(width / 2, height / 2);
    this.world = new MeadowWorld(this, this.layout);
    this.world.bindPlayer(this.player);
    const candidate = { x: old.x, y: previousHeight ? old.y * height / previousHeight : old.y };
    const feet = { x: candidate.x - 12, y: candidate.y - 3, width: 24, height: 28 };
    const safe = preservePosition && feet.x >= 0 && feet.x + feet.width <= width && feet.y >= 0 && feet.y + feet.height <= height &&
      this.layout.obstacles.every(object => !overlaps(feet, obstacleRect(object), 4));
    const position = safe ? candidate : this.layout.spawn;
    (this.player.body as Phaser.Physics.Arcade.Body).reset(position.x, position.y);
    this.drawHud();
  }

  private drawHud() {
    this.hud = this.add.container(0, 0).setDepth(100000);
    const panel = this.add.rectangle(16, 16, 176, 44, 0x132419, 0.85).setOrigin(0);
    const label = this.add.text(28, 30, `HP ${this.playerHealth}/${SETTINGS.playerHealth}`, {
      fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#dfdfbd',
    }).setName('health-label');
    const hearts = this.add.graphics();
    for (let i = 0; i < this.playerHealth; i++) {
      const x = 104 + i * 26;
      hearts.fillStyle(0xd98278).fillCircle(x - 4, 35, 5).fillCircle(x + 4, 35, 5).fillTriangle(x - 9, 36, x + 9, 36, x, 47);
    }
    const hint = this.add.text(20, this.layout.height - 22, 'WASD — движение · R — новая поляна · Esc — в лагерь', {
      fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#d3dcba', backgroundColor: '#1b2c20', padding: { x: 8, y: 4 },
    }).setOrigin(0, 1);
    this.hud.add([panel, label, hearts, hint]);
  }
}
