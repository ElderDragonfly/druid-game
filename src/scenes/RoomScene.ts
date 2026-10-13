import Phaser from 'phaser';
import { SETTINGS } from '../settings';
import { Beetle } from '../entities/Beetle';

export class RoomScene extends Phaser.Scene {
  player!: Phaser.Physics.Arcade.Image;
  projectiles!: Phaser.Physics.Arcade.Group;
  enemy!: Beetle;
  private movement!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private arrows!: Phaser.Types.Input.Keyboard.CursorKeys;
  private lastShot = -Infinity;
  private shadow!: Phaser.GameObjects.Ellipse;
  private status!: Phaser.GameObjects.Text;

  constructor() { super('Room'); }

  create() {
    this.lastShot = -Infinity;
    this.drawRoom();
    this.createTextures();

    const room = SETTINGS.room;
    this.physics.world.setBounds(room.x, room.y, room.width, room.height);
    const centerX = room.x + room.width / 2;
    const centerY = room.y + room.height / 2;
    this.shadow = this.add.ellipse(centerX, centerY + 16, 34, 12, 0x0c1611, 0.45);
    this.player = this.physics.add.image(centerX, centerY, 'druid').setDepth(2);
    this.player.setSize(24, 30).setOffset(10, 12).setCollideWorldBounds(true);
    this.projectiles = this.physics.add.group({ maxSize: 32 });
    this.enemy = this.spawnEnemy();
    this.physics.add.overlap(this.enemy, this.projectiles, (_enemy, projectile) => {
      const shot = projectile as Phaser.Physics.Arcade.Image;
      if (!shot.active || !this.enemy.active) return;
      this.removeShot(shot);
      this.enemy.takeHit();
      if (!this.enemy.active) this.status.setText('Жук побеждён! Нажмите R, чтобы попробовать снова.');
    });

    const keyboard = this.input.keyboard!;
    // Физические коды клавиш сохраняют WASD и при русской раскладке.
    this.movement = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as typeof this.movement;
    this.arrows = keyboard.createCursorKeys();
    const restart = () => this.scene.restart();
    keyboard.on('keydown-R', restart);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.off('keydown-R', restart));

    // Снятие фокуса не оставляет персонажа бегущим с зажатой клавишей.
    const resetInput = () => {
      keyboard.resetKeys();
      this.player.setVelocity(0, 0);
    };
    this.game.events.on(Phaser.Core.Events.BLUR, resetInput);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(Phaser.Core.Events.BLUR, resetInput));
  }

  update(time: number) {
    const keys = this.movement;
    const direction = new Phaser.Math.Vector2(
      Number(keys.right.isDown) - Number(keys.left.isDown),
      Number(keys.down.isDown) - Number(keys.up.isDown),
    ).normalize().scale(SETTINGS.playerSpeed);
    this.player.setVelocity(direction.x, direction.y);
    this.shadow.setPosition(this.player.x, this.player.y + 16);
    this.enemy.follow(this.player);

    // Один снаряд за выстрел; при нескольких стрелках приоритет вверх/вниз/влево/вправо.
    let shotX = 0;
    let shotY = 0;
    if (this.arrows.up.isDown) shotY = -1;
    else if (this.arrows.down.isDown) shotY = 1;
    else if (this.arrows.left.isDown) shotX = -1;
    else if (this.arrows.right.isDown) shotX = 1;
    if ((shotX || shotY) && time - this.lastShot >= SETTINGS.fireInterval) {
      this.fire(shotX, shotY);
      this.lastShot = time;
    }

    const room = SETTINGS.room;
    for (const object of this.projectiles.getChildren()) {
      const shot = object as Phaser.Physics.Arcade.Image;
      if (shot.active && (shot.x < room.x + 5 || shot.x > room.x + room.width - 5 ||
        shot.y < room.y + 5 || shot.y > room.y + room.height - 5)) {
        this.removeShot(shot);
      }
    }
  }

  private spawnEnemy() {
    const room = SETTINGS.room;
    const inset = 40;
    const left = room.x + inset;
    const right = room.x + room.width - inset;
    const top = room.y + inset;
    const bottom = room.y + room.height - inset;
    for (let attempt = 0; attempt < 32; attempt++) {
      const x = Phaser.Math.Between(left, right);
      const y = Phaser.Math.Between(top, bottom);
      if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) >= SETTINGS.enemy.minSpawnDistance) {
        return new Beetle(this, x, y);
      }
    }
    // Ограниченное число попыток: запасной вариант — самый дальний угол.
    const corners = [[left, top], [right, top], [left, bottom], [right, bottom]];
    corners.sort((a, b) => Phaser.Math.Distance.Between(b[0], b[1], this.player.x, this.player.y) -
      Phaser.Math.Distance.Between(a[0], a[1], this.player.x, this.player.y));
    return new Beetle(this, corners[0][0], corners[0][1]);
  }

  private removeShot(shot: Phaser.Physics.Arcade.Image) {
    this.projectiles.killAndHide(shot);
    shot.disableBody(true, true);
  }

  private fire(x: number, y: number) {
    // Объекты используются повторно, чтобы их число не росло при долгой стрельбе.
    const shot = this.projectiles.get(this.player.x + x * 22, this.player.y + y * 22, 'seed') as Phaser.Physics.Arcade.Image | null;
    if (!shot) return;
    shot.enableBody(true, this.player.x + x * 22, this.player.y + y * 22, true, true);
    shot.setDepth(3).setCircle(5, 3, 3);
    shot.setVelocity(x * SETTINGS.projectileSpeed, y * SETTINGS.projectileSpeed);
  }

  private createTextures() {
    if (this.textures.exists('druid')) return;
    const g = this.add.graphics();
    // Временный образ: зелёная мантия, лицо и венок из листьев.
    g.fillStyle(0x18261d).fillRoundedRect(8, 13, 28, 29, 9);
    g.fillStyle(0x648356).fillTriangle(22, 12, 7, 40, 37, 40);
    g.fillStyle(0x9cb67e).fillTriangle(22, 17, 15, 38, 29, 38);
    g.fillStyle(0xddc7a3).fillCircle(22, 16, 8);
    g.fillStyle(0x263c2c).fillEllipse(22, 9, 21, 11);
    g.fillStyle(0xa5cb7c).fillEllipse(12, 8, 9, 5).fillEllipse(31, 7, 9, 5);
    g.fillStyle(0x283327).fillCircle(19, 17, 1.5).fillCircle(25, 17, 1.5);
    g.generateTexture('druid', 44, 44);
    g.clear();
    g.fillStyle(0xbcdf93, 0.25).fillCircle(8, 8, 8);
    g.fillStyle(0xd6edac).fillCircle(8, 8, 5);
    g.generateTexture('seed', 16, 16);
    g.clear();
    // Медный лесной жук: шесть лап, панцирь и усики. Смотрит вверх.
    g.lineStyle(3, 0x604735);
    for (const y of [19, 27, 35]) {
      g.lineBetween(15, y, 7, y + 3).lineBetween(33, y, 41, y + 3);
    }
    g.lineBetween(20, 12, 16, 5).lineBetween(28, 12, 32, 5);
    g.fillStyle(0x392c23).fillEllipse(24, 28, 28, 32).fillCircle(24, 13, 9);
    g.fillStyle(0xb8794d).fillEllipse(24, 27, 23, 28);
    g.fillStyle(0xd6a15e).fillEllipse(20, 24, 8, 19);
    g.lineStyle(2, 0x70472e).lineBetween(24, 14, 24, 39);
    g.fillStyle(0xe8d49d).fillCircle(20, 11, 2).fillCircle(28, 11, 2);
    g.generateTexture('beetle', 48, 48);
    g.destroy();
  }

  private drawRoom() {
    const g = this.add.graphics();
    const room = SETTINGS.room;
    g.fillStyle(0x0d1712).fillRoundedRect(44, 112, 872, 452, 14);
    g.fillStyle(0x354639).fillRoundedRect(48, 108, 864, 452, 12);
    g.fillStyle(0x26382a).fillRect(room.x, room.y, room.width, room.height);
    // Неброская сетка каменных плит — помогает видеть скорость движения.
    for (let y = room.y; y < room.y + room.height; y += 32) {
      for (let x = room.x; x < room.x + room.width; x += 32) {
        const index = (x - room.x) / 32 + (y - room.y) / 32;
        g.fillStyle(index % 3 === 0 ? 0x2d4030 : 0x293b2d).fillRect(x + 1, y + 1, 30, 30);
      }
    }
    g.lineStyle(1, 0x607455, 0.5).strokeRect(room.x, room.y, room.width, room.height);
    g.lineStyle(1, 0x8caa6d, 0.2).strokeCircle(480, 336, 57).strokeCircle(480, 336, 63);
    for (const [x, y] of [[49, 135], [911, 135], [49, 537], [911, 537]]) {
      g.fillStyle(0x54764b).fillCircle(x, y, 17);
      g.fillStyle(0x76965c).fillCircle(x - 5, y - 5, 9);
    }
    const fontFamily = 'Arial, sans-serif';
    this.add.text(48, 33, 'ПЕРВАЯ КОМНАТА', { fontFamily, fontSize: '26px', color: '#e0e8cc' });
    this.status = this.add.text(49, 72, 'Лесной жук · 3 попадания · R — новая попытка', { fontFamily, fontSize: '14px', color: '#99b295' });
    this.add.text(909, 48, '01 / ПРОТОТИП', { fontFamily, fontSize: '12px', color: '#a7bd91' }).setOrigin(1, 0);
    this.add.text(48, 587, 'W A S D   ДВИЖЕНИЕ', { fontFamily, fontSize: '14px', color: '#c4d4b2' });
    this.add.text(378, 587, '↑ ↓ ← →   СТРЕЛЬБА', { fontFamily, fontSize: '14px', color: '#c4d4b2' });
    this.add.text(911, 587, 'R   СНАЧАЛА', { fontFamily, fontSize: '14px', color: '#99b295' }).setOrigin(1, 0);
  }
}
