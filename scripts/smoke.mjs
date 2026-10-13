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
      enemy: scene.enemy.active ? {
        x: scene.enemy.x, y: scene.enemy.y, health: scene.enemy.health,
        vx: scene.enemy.body.velocity.x, vy: scene.enemy.body.velocity.y,
      } : null,
    };
  });
  const restart = async (withEnemy = false) => {
    const previousPlayer = await page.evaluateHandle(async () => {
      const { game } = await import('/src/main.ts');
      return game.scene.getScene('Room').player;
    });
    await page.keyboard.press('r');
    await page.waitForFunction(async previous => {
      const { game } = await import('/src/main.ts');
      const scene = game.scene.getScene('Room');
      return scene.player !== previous && scene.player.x === 480 && scene.player.y === 336 && scene.projectiles.getLength() === 0;
    }, previousPlayer);
    await previousPlayer.dispose();
    // Исходные проверки управления выполняются в очищенной комнате.
    // Ниже враг отдельно проверяется с настоящим движением и попаданиями.
    if (!withEnemy) await page.evaluate(async () => {
      const { game } = await import('/src/main.ts');
      game.scene.getScene('Room').enemy.destroy();
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

  const spawns = new Set();
  for (let run = 0; run < 5; run++) {
    await restart(true);
    const spawn = await state();
    const e = spawn.enemy;
    ok(e !== null && e.health === 3 && e.x >= 100 && e.x <= 860 && e.y >= 164 && e.y <= 508 &&
      Math.hypot(e.x - spawn.x, e.y - spawn.y) >= 235, `Безопасное появление жука внутри комнаты: попытка ${run + 1}`);
    spawns.add(`${Math.round(e.x)},${Math.round(e.y)}`);
  }
  ok(spawns.size > 1, 'Место появления меняется между попытками');
  const beforeChase = await state();
  const startingDistance = Math.hypot(beforeChase.enemy.x - beforeChase.x, beforeChase.enemy.y - beforeChase.y);
  const chasing = await waitState(current => current.enemy &&
    Math.hypot(current.enemy.x - current.x, current.enemy.y - current.y) < startingDistance - 25);
  ok(Math.abs(Math.hypot(chasing.enemy.vx, chasing.enemy.vy) - 90) < 0.1 &&
    Math.hypot(chasing.enemy.vx, chasing.enemy.vy) < 220, 'Жук приближается к игроку медленнее его');
  await hold('d', 350);
  const retargeted = await state();
  const dx = retargeted.x - retargeted.enemy.x;
  const dy = retargeted.y - retargeted.enemy.y;
  const aim = (dx * retargeted.enemy.vx + dy * retargeted.enemy.vy) / (Math.hypot(dx, dy) * 90);
  ok(aim > 0.99, 'Жук меняет направление вслед за перемещением игрока');

  await restart(true);
  // Фиксируем только начальные позиции для воспроизводимого боевого сценария.
  // AI, физика, обработка клавиш и попадания работают без подмены.
  await page.evaluate(async () => {
    const { game } = await import('/src/main.ts');
    const scene = game.scene.getScene('Room');
    scene.player.body.reset(480, 336);
    scene.enemy.body.reset(640, 336);
  });
  await waitState(current => current.enemy.vx === 0 && current.enemy.vy === 0 && current.enemy.x < 515);
  const close = await state();
  const closeDistance = Math.hypot(close.enemy.x - close.x, close.enemy.y - close.y);
  await delay(200);
  const staying = await state();
  ok(closeDistance > 25 && closeDistance <= 33 && Math.abs(staying.enemy.x - close.enemy.x) < 1,
    'Жук останавливается рядом с друидом');

  for (const health of [2, 1, 0]) {
    await page.keyboard.down('ArrowRight');
    await waitState(current => current.shots.length > 0 || !current.enemy || current.enemy.health === health);
    await page.keyboard.up('ArrowRight');
    const hit = await waitState(current => health === 0 ? current.enemy === null : current.enemy?.health === health);
    ok(health === 0 ? hit.enemy === null : hit.enemy.health === health,
      health === 0 ? 'Третье попадание уничтожает жука' : `Попадание снимает ровно одно здоровье: осталось ${health}`);
    ok(hit.shots.length === 0, 'Попавший снаряд исчезает и не наносит повторный урон');
  }
  await hold('ArrowRight', 400);
  ok((await state()).shots.length > 0, 'После гибели жука стрельба продолжает работать');
  await restart(true);
  const newRun = await state();
  ok(newRun.enemy?.health === 3 && newRun.shots.length === 0, 'R создаёт нового жука с полным здоровьем');
  ok(errors.length === 0, `Нет ошибок браузера: ${errors.join('; ')}`);
  console.log(`\nПроверок пройдено: ${passed}. Скриншот: test-results/room.png`);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
