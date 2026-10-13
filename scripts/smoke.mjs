import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let serverOutput = '';
server.stdout.on('data', chunk => { serverOutput += chunk; });
server.stderr.on('data', chunk => { serverOutput += chunk; });
let browser;
let passed = 0;
const errors = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function ok(condition, message) { assert.ok(condition, message); passed++; console.log(`PASS: ${message}`); }

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Vite exited: ${serverOutput}`);
    try { ready = (await fetch('http://127.0.0.1:4175')).ok; } catch {}
    if (ready) break;
    await delay(100);
  }
  assert.ok(ready, `Vite did not start: ${serverOutput}`);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-webgl'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 820 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:4175');
  await page.waitForFunction(async () => {
    const { game } = await import('/src/main.ts');
    return game.scene.isActive('Room') && !!game.scene.getScene('Room').player?.body;
  });

  const state = () => page.evaluate(async () => {
    const { game } = await import('/src/main.ts');
    const scene = game.scene.getScene('Room');
    const p = scene.player;
    return {
      x: p.x, y: p.y, vx: p.body.velocity.x, vy: p.body.velocity.y,
      body: { x: p.body.x, y: p.body.y, right: p.body.right, bottom: p.body.bottom },
      shots: scene.projectiles.getChildren().filter(s => s.active).map(s => ({ x: s.x, y: s.y, vx: s.body.velocity.x, vy: s.body.velocity.y })),
      poolSize: scene.projectiles.getLength(),
    };
  });
  const restart = async () => {
    await page.keyboard.press('r');
    await page.waitForFunction(async () => {
      const { game } = await import('/src/main.ts');
      const scene = game.scene.getScene('Room');
      return scene.player.x === 480 && scene.player.y === 336 && scene.projectiles.getLength() === 0;
    });
  };
  const hold = async (key, ms) => {
    await page.keyboard.down(key);
    await delay(ms);
    await page.keyboard.up(key);
    await delay(60);
  };
  const waitState = async (predicate, timeout = 10000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const current = await state();
      if (predicate(current)) return current;
      await delay(30);
    }
    throw new Error(`Игровое состояние не достигнуто: ${JSON.stringify(await state())}`);
  };

  ok(await page.locator('canvas').count() === 1, 'Одна игровая сцена отрисована');
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('../test-results/room.png', import.meta.url)) });

  for (const [key, axis, sign] of [['w', 'y', -1], ['s', 'y', 1], ['a', 'x', -1], ['d', 'x', 1]]) {
    await restart();
    const before = await state();
    await page.keyboard.down(key);
    await waitState(current => (current[axis] - before[axis]) * sign > 25);
    await page.keyboard.up(key);
    await waitState(current => current.vx === 0 && current.vy === 0);
    const after = await state();
    ok((after[axis] - before[axis]) * sign > 25, `WASD: движение на ${key.toUpperCase()}`);
    await delay(150);
    const stopped = await state();
    ok(Math.abs(stopped[axis] - after[axis]) < 2, `Остановка после отпускания ${key.toUpperCase()}`);
  }
  await restart();
  await page.keyboard.down('w');
  await page.keyboard.down('d');
  await delay(150);
  const diagonal = await state();
  ok(Math.abs(Math.hypot(diagonal.vx, diagonal.vy) - 220) < 0.1, 'Диагональ не увеличивает скорость');
  await page.keyboard.up('w');
  await page.keyboard.up('d');

  for (const [key, boundary] of [['w', 'top'], ['s', 'bottom'], ['a', 'left'], ['d', 'right']]) {
    await restart();
    await page.keyboard.down(key);
    await waitState(current => {
      const b = current.body;
      return Math.abs({ top: b.y, bottom: b.bottom, left: b.x, right: b.right }[boundary] - { top: 128, bottom: 544, left: 64, right: 896 }[boundary]) < 1;
    });
    await page.keyboard.up(key);
    const { body } = await state();
    const coordinate = { top: body.y, bottom: body.bottom, left: body.x, right: body.right }[boundary];
    const expected = { top: 128, bottom: 544, left: 64, right: 896 }[boundary];
    ok(Math.abs(coordinate - expected) < 1, `Стена удерживает игрока: ${boundary}`);
  }
  for (const [key, axis, sign] of [['ArrowUp', 'vy', -1], ['ArrowDown', 'vy', 1], ['ArrowLeft', 'vx', -1], ['ArrowRight', 'vx', 1]]) {
    await restart();
    await page.keyboard.down(key);
    await waitState(current => current.shots.length === 1);
    await page.keyboard.up(key);
    const current = await state();
    ok(current.shots.length === 1 && current.shots[0][axis] === sign * 440, `Один снаряд в направлении ${key}`);
  }
  await restart();
  await page.keyboard.down('d');
  await page.keyboard.down('ArrowUp');
  await waitState(current => current.x > 540 && current.shots.length >= 2);
  const simultaneous = await state();
  ok(simultaneous.x > 540 && simultaneous.shots.length >= 2, 'Движение и повторная стрельба работают одновременно');
  await page.keyboard.up('d');
  await page.keyboard.up('ArrowUp');
  await waitState(current => current.shots.length === 0);
  ok((await state()).shots.length === 0, 'Снаряды убираются у стен');

  await restart();
  await hold('ArrowRight', 3500);
  ok((await state()).poolSize <= 12, 'Снаряды переиспользуются при длительной стрельбе');
  await restart();
  const reset = await state();
  ok(reset.x === 480 && reset.y === 336 && reset.shots.length === 0, 'R сбрасывает комнату и снаряды');
  ok(errors.length === 0, `Нет ошибок браузера: ${errors.join('; ')}`);
  console.log(`\nПроверок пройдено: ${passed}. Скриншот: test-results/room.png`);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
