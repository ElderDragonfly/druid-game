import Phaser from 'phaser';
import { SETTINGS } from '../settings';

// Враг отвечает за своё движение, здоровье и отображение.
// Сцена выбирает место появления и связывает врага со снарядами.
export class Beetle extends Phaser.Physics.Arcade.Image {
  health: number = SETTINGS.enemy.health;
  private shadow: Phaser.GameObjects.Ellipse;
  private healthBar: Phaser.GameObjects.Graphics;
  private direction = new Phaser.Math.Vector2();

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'beetle');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(2).setCircle(13, 11, 11).setCollideWorldBounds(true);
    this.shadow = scene.add.ellipse(x, y + 12, 36, 14, 0x0c1611, 0.4).setDepth(1);
    this.healthBar = scene.add.graphics().setDepth(4);
    this.drawHealth();
  }

  follow(target: Phaser.GameObjects.Image) {
    if (!this.active) return;
    this.direction.set(target.x - this.x, target.y - this.y);
    if (this.direction.length() > SETTINGS.enemy.stopDistance) {
      this.direction.normalize().scale(SETTINGS.enemy.speed);
      this.setVelocity(this.direction.x, this.direction.y);
      this.setRotation(this.direction.angle() + Math.PI / 2);
    } else {
      // В точке игрока направление нулевое: не допускаем дрожания на месте.
      this.setVelocity(0, 0);
    }
    this.shadow.setPosition(this.x, this.y + 12);
    this.drawHealth();
  }

  takeHit() {
    if (!this.active) return;
    this.health--;
    if (this.health <= 0) {
      this.destroy();
      return;
    }
    this.drawHealth();
    this.setTintFill(0xf5deb2);
    this.scene.time.delayedCall(100, () => { if (this.active) this.clearTint(); });
  }

  private drawHealth() {
    this.healthBar.clear().setPosition(this.x - 13, this.y - 30);
    for (let i = 0; i < SETTINGS.enemy.health; i++) {
      this.healthBar.fillStyle(i < this.health ? 0xedbd7d : 0x473d30).fillRoundedRect(i * 10, 0, 7, 4, 1);
    }
  }

  override destroy(fromScene?: boolean) {
    this.shadow.destroy();
    this.healthBar.destroy();
    super.destroy(fromScene);
  }
}
