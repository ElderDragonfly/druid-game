// Скорости заданы в пикселях в секунду; интервал — в миллисекундах.
export const SETTINGS = {
  width: 960,
  height: 640,
  room: { x: 64, y: 128, width: 832, height: 416 },
  playerSpeed: 220,
  playerHealth: 3,
  contactDamageInterval: 1000,
  projectileSpeed: 440,
  fireInterval: 220,
  enemy: { speed: 90, health: 3, minSpawnDistance: 240, stopDistance: 1 },
} as const;
