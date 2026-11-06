import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const servers = [], errors = [];
let browser, passed = 0;
const ok = (condition, message) => { assert.ok(condition, message); passed++; console.log(`PASS: ${message}`); };
const start = async (mode, port) => {
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', mode,
    '--host', '127.0.0.1', '--port', `${port}`, '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  servers.push(server);
  let output = '';
  server.stdout.on('data', chunk => { output += chunk; });
  server.stderr.on('data', chunk => { output += chunk; });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(output);
    try { if ((await fetch(url)).ok) return url; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Vite did not start: ${output}`);
};

try {
  const url = await start('pathways', 4185);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true, args: ['--no-sandbox', '--disable-webgl'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => localStorage.setItem('druid-game.run.v1', 'preserve-the-original-run'));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url);
  await page.evaluate(async () => {
    window.__pathsGame = (await import([...document.scripts].find(s => s.src.includes('/src/main.ts')).src)).game;
  });
  await page.waitForFunction(() => window.__pathsGame.scene.getScene('PathwaysRoom')?.player?.body?.enable);
  ok(await page.evaluate(() => window.__pathsGame.scene.getScenes(true).map(s => s.sys.settings.key).join() === 'PathwaysRoom'),
    'Новая команда сразу открывает только поляну, без старого меню и событий');

  ok(await page.evaluate(async () => {
    const { generatePathRoom, PATH_ROOM: p } = await import('/src/pathways/roomLayout.ts');
    const { environmentVariant } = await import('/src/data/environment.ts');
    const variants = new Set();
    const inside = (point, r) => point.x > r.x && point.x < r.x + r.width && point.y > r.y && point.y < r.y + r.height;
    for (let seed = 0; seed < 500; seed++) for (const index of [0, 1]) {
      const l = generatePathRoom(seed, index);
      if (l.trees.length !== (index === 0 ? 21 : 22) || JSON.stringify(l) !== JSON.stringify(generatePathRoom(seed, index))) return false;
      if (l.walls.some(r => inside(l.spawn, r))) return false;
      for (const t of l.trees) {
        const art = environmentVariant(t.kind, t.variant); variants.add(art.id);
        if (inside(t, { x: 175, y: 300, width: 1250, height: 500 })) return false;
        if (index === 0 && t.y < 300 && t.x - art.anchorX * art.scale < p.gate.x + p.gate.width &&
          t.x + (art.width - art.anchorX) * art.scale > p.gate.x) return false;
      }
      for (let y = 1; y < p.clearing.y; y += 10) {
        const blocked = l.walls.some(r => inside({ x: 800, y }, r));
        if (blocked !== (index === 1)) return false;
      }
    }
    return variants.size === 2;
  }), '500 seed: обе породы, свободный центр, 21/22 дерева и гарантированный северный проход только первой поляны');

  const place = async (x, y) => page.evaluate(({ x, y }) => {
    const s = window.__pathsGame.scene.getScene('PathwaysRoom');
    s.input.keyboard.resetKeys(); s.player.setVelocity(0, 0); s.player.body.reset(x, y); s.player.body.updateFromGameObject();
  }, { x, y });
  const moveIntoWall = async (key, direction, x, y, expected) => {
    await place(x, y); await page.keyboard.down(key);
    await page.waitForFunction(d => window.__pathsGame.scene.getScene('PathwaysRoom').player.body.blocked[d], direction);
    await page.keyboard.up(key);
    const actual = await page.evaluate(d => {
      const b = window.__pathsGame.scene.getScene('PathwaysRoom').player.body;
      return d === 'left' ? b.left : d === 'right' ? b.right : d === 'up' ? b.top : b.bottom;
    }, direction);
    ok(Math.abs(actual - expected) < .1, `Реальная клавиша ${key}: граница ${direction} останавливает стопы точно у ${expected}`);
  };

  await place(800, 610); await page.keyboard.down('d');
  await page.waitForFunction(() => {
    const p = window.__pathsGame.scene.getScene('PathwaysRoom').player;
    return p.x > 830 && p.anims.isPlaying && p.actorState.facing === 'right';
  });
  await page.keyboard.up('d');
  await page.waitForFunction(() => {
    const p = window.__pathsGame.scene.getScene('PathwaysRoom').player;
    return !p.anims.isPlaying && p.frame.name === 'right';
  });
  ok(true, 'WASD использует принятую ходьбу и отдельную устойчивую позу после остановки');

  await moveIntoWall('a', 'left', 195, 500, 160);
  await moveIntoWall('d', 'right', 1400, 500, 1440);
  await moveIntoWall('s', 'down', 800, 785, 830);
  await moveIntoWall('w', 'up', 420, 310, 270);

  const beforeResize = await page.evaluate(() => {
    const s = window.__pathsGame.scene.getScene('PathwaysRoom');
    return { x: s.player.x, y: s.player.y, layout: JSON.stringify(s.layout) };
  });
  for (const size of [{ width: 1920, height: 1080 }, { width: 720, height: 900 }, { width: 1920, height: 540 }]) {
    await page.setViewportSize(size);
    await page.waitForFunction(({ width, height }) => window.__pathsGame.scale.width === width && window.__pathsGame.scale.height === height, size);
    ok(await page.evaluate(before => {
      const s = window.__pathsGame.scene.getScene('PathwaysRoom'), v = s.cameras.main.worldView;
      return s.player.x === before.x && s.player.y === before.y && JSON.stringify(s.layout) === before.layout &&
        v.x <= 1 && v.y <= 1 && v.right >= 1599 && v.bottom >= 999 &&
        s.game.canvas.width === s.scale.width && s.game.canvas.height === s.scale.height;
    }, beforeResize), `${size.width}×${size.height}: вся поляна видна, canvas заполняет окно, мир и герой не пересоздаются`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await place(800, 310); await page.keyboard.down('w');
  await page.waitForFunction(() => {
    const s = window.__pathsGame.scene.getScene('PathwaysRoom');
    return s.layout.index === 1 && !s.transitioning && s.player.body.enable;
  }, undefined, { timeout: 10000 });
  await page.keyboard.up('w');
  ok(await page.evaluate(() => {
    const s = window.__pathsGame.scene.getScene('PathwaysRoom');
    return s.layout.trees.length === 22 && s.player.y > 650 && s.children.list.filter(o => o.name === 'grass-foreground').length === 1;
  }), 'Проход сверху действительно переводит на вторую пустую поляну; герой появляется снизу, слои не дублируются');
  await moveIntoWall('w', 'up', 800, 310, 270);
  await moveIntoWall('s', 'down', 800, 785, 830);
  await moveIntoWall('a', 'left', 195, 500, 160);
  await moveIntoWall('d', 'right', 1400, 500, 1440);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('e'); await page.keyboard.press('Escape');
  ok(await page.evaluate(() => {
    const s = window.__pathsGame.scene.getScene('PathwaysRoom');
    return s.layout.index === 1 && !s.player.casting.active && !s.world && !s.acorns &&
      localStorage.getItem('druid-game.run.v1') === 'preserve-the-original-run';
  }), 'Второй участок закрыт, старые бои/взаимодействия не включены, сохранение прежней игры не перезаписывается');
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await place(800, 610);
  await page.screenshot({ path: new URL('../test-results/pathways-second.png', import.meta.url).pathname });
  await page.reload();
  await page.evaluate(async () => { window.__pathsGame = (await import('/src/main.ts')).game; });
  await page.waitForFunction(() => window.__pathsGame.scene.getScene('PathwaysRoom')?.player?.body?.enable);
  ok(await page.evaluate(() => window.__pathsGame.scene.getScene('PathwaysRoom').layout.index === 0 &&
    localStorage.getItem('druid-game.run.v1') === 'preserve-the-original-run'), 'Перезагрузка начинает новый маршрут с первой поляны, не трогая старый сейв');
  await page.screenshot({ path: new URL('../test-results/pathways-first.png', import.meta.url).pathname });

  const legacyUrl = await start('legacy', 4186);
  const old = await browser.newPage();
  old.on('pageerror', error => errors.push(error.message));
  await old.goto(legacyUrl);
  await old.evaluate(async () => { window.__legacyGame = (await import('/src/main.ts')).game; });
  await old.waitForFunction(() => window.__legacyGame.scene.isActive('MainMenu'));
  ok(await old.evaluate(() => window.__legacyGame.scene.getScenes(true).map(s => s.sys.settings.key).join() === 'MainMenu' &&
    !window.__legacyGame.scene.keys.PathwaysRoom), 'Вторая команда одновременно запускает прежнюю игру с исходным меню');
  ok(errors.length === 0, `Нет ошибок браузера: ${errors.join('; ')}`);
  console.log(`\nПроверок пройдено: ${passed}.`);
} finally {
  await browser?.close();
  servers.forEach(server => server.kill('SIGTERM'));
}
