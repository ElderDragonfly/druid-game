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
  await page.evaluate(async () => {
    const { game } = await import('/src/main.ts');
    window.__smokeGame = game;
  });
  // Предикат ожидания синхронный: Promise сам по себе является truthy.
  const waitScene = key => page.waitForFunction(sceneKey => {
    const game = window.__smokeGame;
    const active = game.scene.getScenes(true);
    return active.length === 1 && active[0].sys.settings.key === sceneKey &&
      (sceneKey !== 'Room' || active[0].physics.world.colliders.getActive().length === 1);
  }, key);
  const activeScenes = () => page.evaluate(async () => {
    const { game } = await import('/src/main.ts');
    return game.scene.getScenes(true).map(scene => scene.sys.settings.key);
  });
  const clickNamed = async (sceneKey, name) => {
    const position = await page.evaluate(async ({ key, id }) => {
      const { game } = await import('/src/main.ts');
      const scene = game.scene.getScene(key);
      const object = scene.children.getByName(id);
      const canvas = game.canvas.getBoundingClientRect();
      const camera = scene.cameras.main;
      return {
        x: canvas.left + (camera.x + (object.x - camera.worldView.x) * camera.zoom) * canvas.width / game.scale.width,
        y: canvas.top + (camera.y + (object.y - camera.worldView.y) * camera.zoom) * canvas.height / game.scale.height,
      };
    }, { key: sceneKey, id: name });
    await page.mouse.click(position.x, position.y);
  };
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await waitScene('MainMenu');
  const initialScenes = await activeScenes();
  ok(initialScenes.join() === 'MainMenu', `При запуске открывается только главное меню: ${initialScenes.join()}`);
  const loaded = await page.evaluate(async () => {
    const { game } = await import('/src/main.ts');
    return ['main-camp', 'selection-camp'].every(key => game.textures.exists(key) && game.textures.get(key).getSourceImage().width > 900);
  });
  ok(loaded, 'Оба лесных фона загружены как настоящие изображения');
  await page.screenshot({ path: fileURLToPath(new URL('../test-results/main-menu.png', import.meta.url)) });
  await clickNamed('MainMenu', 'exit');
  await delay(100);
  ok((await activeScenes()).join() === 'MainMenu', 'Выход пока не функционален');
  await clickNamed('MainMenu', 'play');
  await waitScene('CharacterSelect');
  ok((await activeScenes()).join() === 'CharacterSelect', 'Играть открывает выбор персонажа');
  const selection = () => page.evaluate(async () => {
    const { game } = await import('/src/main.ts');
    const scene = game.scene.getScene('CharacterSelect');
    return {
      id: scene.selectedId,
      cards: scene.children.list.filter(item => item.name.startsWith('character-')).map(item => ({ name: item.name, enabled: item.enabled })),
      preview: scene.children.getByName('selected-character-preview').texture.key,
      background: scene.children.getByName('camp-background').getData('sourceTexture'),
      pixels: { width: scene.children.getByName('camp-background').width, height: scene.children.getByName('camp-background').height },
    };
  });
  const slots = await selection();
  ok(slots.cards.length === 3 && slots.cards[0].enabled && !slots.cards[1].enabled && !slots.cards[2].enabled,
    'Три ячейки: крайняя левая доступна, остальные закрыты');
  ok(slots.preview === 'druid-seated' && slots.background === 'selection-camp', 'Заглушка персонажа и фон — отдельные элементы');
  ok(slots.pixels.width === 384 && slots.pixels.height === 216, 'Пиксели фона выбора увеличены на четверть: 384×216 вместо 480×270');
  for (const id of ['character-locked-1', 'character-locked-2']) {
    await clickNamed('CharacterSelect', id);
    ok((await selection()).id === 'druid' && (await activeScenes()).join() === 'CharacterSelect', `Закрытую ячейку нельзя выбрать: ${id}`);
  }
  await clickNamed('CharacterSelect', 'character-druid');
  ok((await selection()).id === 'druid', 'Первый персонаж выбирается мышью');
  await page.screenshot({ path: fileURLToPath(new URL('../test-results/character-select.png', import.meta.url)) });
  await clickNamed('CharacterSelect', 'back');
  await waitScene('MainMenu');
  ok((await activeScenes()).join() === 'MainMenu', 'Назад возвращает главное меню');
  await page.keyboard.press('Enter');
  await waitScene('CharacterSelect');
  ok((await activeScenes()).join() === 'CharacterSelect', 'Главное меню поддерживает Enter');
  await page.keyboard.press('Escape');
  await waitScene('MainMenu');
  ok((await activeScenes()).join() === 'MainMenu', 'Esc возвращает из выбора в главное меню');
  await clickNamed('MainMenu', 'play');
  await waitScene('CharacterSelect');
  await clickNamed('CharacterSelect', 'start-run');
  await waitScene('Room');
  ok((await activeScenes()).join() === 'Room', 'Начать запускает игровую комнату');
  const chosen = await page.evaluate(async () => {
    const { game } = await import('/src/main.ts');
    return game.scene.getScene('Room').characterId;
  });
  ok(chosen === 'druid', 'Выбранный персонаж передан в комнату');

  const state = () => page.evaluate(() => {
    const game = window.__smokeGame;
    const scene = game.scene.getScene('Room');
    const p = scene.player;
    const rect = body => ({ x: body.x, y: body.y, width: body.width, height: body.height, right: body.right, bottom: body.bottom });
    const canvas = game.canvas.getBoundingClientRect();
    const view = scene.cameras.main.worldView;
    return {
      x: p.x, y: p.y, vx: p.body.velocity.x, vy: p.body.velocity.y,
      body: rect(p.body), health: scene.playerHealth,
      healthLabel: scene.hud.getByName('health-label').text,
      layout: scene.layout,
      obstacles: scene.world.obstacles.getChildren().map(object => ({ kind: object.getData('kind'), ...rect(object.body) })),
      colliders: scene.physics.world.colliders.getActive().length,
      view: { x: view.x, y: view.y, width: view.width, height: view.height },
      canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
      viewport: { width: innerWidth, height: innerHeight },
      combat: !!scene.enemy || !!scene.projectiles,
    };
  });
  const restart = async () => {
    const previousPlayer = await page.evaluateHandle(() => window.__smokeGame.scene.getScene('Room').player);
    await page.keyboard.press('r');
    await page.waitForFunction(previous => {
      const scene = window.__smokeGame.scene.getScene('Room');
      return scene.player !== previous && scene.player.body;
    }, previousPlayer);
    await previousPlayer.dispose();
    await delay(60);
  };
  const hold = async (key, ms) => {
    await page.keyboard.down(key);
    await delay(ms);
    await page.keyboard.up(key);
    await delay(60);
  };
  const waitState = async (predicate, timeout = 4000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const current = await state();
      if (predicate(current)) return current;
      await delay(30);
    }
    throw new Error(`Игровое состояние не достигнуто: ${JSON.stringify(await state())}`);
  };
  const intersects = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
  const assertMeadow = current => {
    const { canvas, viewport, view, layout } = current;
    ok(Math.abs(canvas.x) < 1 && Math.abs(canvas.y) < 1 && Math.abs(canvas.width - viewport.width) < 1 &&
      Math.abs(canvas.height - viewport.height) < 1, `Поле занимает всё окно ${viewport.width}×${viewport.height}`);
    ok(Math.abs(view.x) < 1 && Math.abs(view.y) < 1 && Math.abs(view.width - layout.width) < 1 &&
      Math.abs(view.height - layout.height) < 1, 'Камера показывает всю поляну без полей');
    ok(current.obstacles.every((body, i) => {
      const object = layout.obstacles[i];
      const size = { tree: [50, 35], bush: [50, 30], stump: [130, 70] }[object.kind];
      return body.kind === object.kind && body.width === size[0] && body.height === size[1] &&
        Math.abs(body.x - (object.x - size[0] / 2)) < 0.1 && Math.abs(body.y - (object.y - size[1])) < 0.1;
    }), 'Физические препятствия совпадают с основаниями нарисованных объектов');
    ok(!current.obstacles.some(body => intersects(current.body, body)), 'Друид появляется в свободном месте');
    ok(current.colliders === 1, `Столкновения подключены один раз: ${current.colliders}`);
  };

  const generation = await page.evaluate(async () => {
    const { generateMeadow, obstacleRect, overlaps } = await import('/src/world/meadowLayout.ts');
    const failures = [];
    let total = 0;
    let minTrees = Infinity;
    for (const height of [405, 540, 640, 960, 1440]) {
      for (let seed = 0; seed < 100; seed++) {
        const layout = generateMeadow(960, height, seed);
        total++;
        const trees = layout.obstacles.filter(o => o.kind === 'tree');
        const bushes = layout.obstacles.filter(o => o.kind === 'bush');
        const stumps = layout.obstacles.filter(o => o.kind === 'stump');
        minTrees = Math.min(minTrees, trees.length);
        const spawn = { x: layout.spawn.x - 10, y: layout.spawn.y - 2.5, width: 20, height: 25 };
        const band = Math.min(135, 960 * 0.18, height * 0.25) + 42;
        if (trees.length < 20 || bushes.length !== 6 || stumps.length !== 1 || stumps[0].x !== 480 || stumps[0].y !== height / 2 + 35 ||
          !trees.every(o => Math.min(o.x, 960 - o.x, o.y, height - o.y) <= band) ||
          !bushes.every(o => o.x >= 960 * 0.23 && o.x <= 960 * 0.77 && o.y >= height * 0.23 && o.y <= height * 0.78) ||
          layout.obstacles.some((object, i) => {
            const r = obstacleRect(object);
            return r.x < 0 || r.y < 0 || r.x + r.width > 960 || r.y + r.height > height || overlaps(r, spawn) ||
              layout.obstacles.slice(i + 1).some(other => overlaps(r, obstacleRect(other), 31));
          })) failures.push({ height, seed });
      }
    }
    return {
      total, minTrees, failures,
      repeatable: JSON.stringify(generateMeadow(960, 640, 123)) === JSON.stringify(generateMeadow(960, 640, 123)),
      different: JSON.stringify(generateMeadow(960, 640, 123).obstacles) !== JSON.stringify(generateMeadow(960, 640, 124).obstacles),
    };
  });
  ok(generation.failures.length === 0, `${generation.total} планировок: пень в центре, 6 кустов, деревья у краёв, свободные проходы и безопасный старт (${JSON.stringify(generation.failures)})`);
  ok(generation.repeatable && generation.different, 'Одинаковый seed воспроизводит поляну, другой меняет окружение');
  ok(await page.locator('canvas').count() === 1, 'Одна игровая сцена отрисована');
  const initial = await state();
  ok(initial.health === 3 && initial.healthLabel === 'HP 3/3', 'Друид сохраняет 3 HP и счётчик');
  assertMeadow(initial);
  await page.screenshot({ path: fileURLToPath(new URL('../test-results/room.png', import.meta.url)) });

  for (const [key, axis, sign] of [['w', 'y', -1], ['s', 'y', 1], ['a', 'x', -1], ['d', 'x', 1]]) {
    await restart();
    const before = await state();
    await page.keyboard.down(key);
    await waitState(current => (current[axis] - before[axis]) * sign > 25);
    await page.keyboard.up(key);
    const after = await waitState(current => current.vx === 0 && current.vy === 0);
    ok((after[axis] - before[axis]) * sign > 25, `WASD: движение на ${key.toUpperCase()}`);
    await delay(150);
    ok(Math.abs((await state())[axis] - after[axis]) < 2, `Остановка после отпускания ${key.toUpperCase()}`);
  }
  await restart();
  await page.keyboard.down('s');
  await page.keyboard.down('d');
  await delay(100);
  const diagonal = await state();
  ok(Math.abs(Math.hypot(diagonal.vx, diagonal.vy) - 220) < 0.1, 'Диагональ не увеличивает скорость');
  await page.keyboard.up('s');
  await page.keyboard.up('d');

  // Меняем только стартовую позицию. Настоящие клавиши и коллайдеры остаются включёнными.
  for (const kind of ['tree', 'bush', 'stump']) {
    await restart();
    for (const [key, axis, sign] of [['d', 'x', 1], ['a', 'x', -1], ['s', 'y', 1], ['w', 'y', -1]]) {
      const current = await state();
      let fixture;
      for (const obstacle of current.obstacles.filter(item => item.kind === kind)) {
        const center = { x: (obstacle.x + obstacle.right) / 2, y: (obstacle.y + obstacle.bottom) / 2 };
        const distance = 26;
        if (axis === 'x') center.x = sign > 0 ? obstacle.x - 10 - distance : obstacle.right + 10 + distance;
        else center.y = sign > 0 ? obstacle.y - 12.5 - distance : obstacle.bottom + 12.5 + distance;
        const body = { x: center.x - 10, y: center.y - 12.5, right: center.x + 10, bottom: center.y + 12.5 };
        if (body.x >= 0 && body.y >= 0 && body.right <= current.layout.width && body.bottom <= current.layout.height &&
          !current.obstacles.some(other => intersects(body, other))) { fixture = { obstacle, center }; break; }
      }
      assert.ok(fixture, `Нет свободного подхода ${kind} ${key}`);
      await page.evaluate(center => {
        const scene = window.__smokeGame.scene.getScene('Room');
        scene.player.body.reset(center.x, center.y - 10);
        scene.player.setVelocity(0, 0);
      }, fixture.center);
      const before = await state();
      await hold(key, 450);
      const after = await state();
      const o = fixture.obstacle;
      const edge = axis === 'x' ? (sign > 0 ? after.body.right - o.x : after.body.x - o.right)
        : (sign > 0 ? after.body.bottom - o.y : after.body.y - o.bottom);
      ok(Math.abs(edge) < 1 && (after[axis] - before[axis]) * sign > 20 && !intersects(after.body, o),
        `Препятствие ${kind} блокирует реальное движение ${key.toUpperCase()}`);
    }
  }

  // Прямой доступ к свободной части края, чтобы деревья не подменяли проверку границы мира.
  for (const [key, side] of [['w', 'top'], ['s', 'bottom'], ['a', 'left'], ['d', 'right']]) {
    await restart();
    const current = await state();
    let center;
    for (let along = 20; along < (side === 'top' || side === 'bottom' ? current.layout.width : current.layout.height) - 20; along += 10) {
      const candidate = side === 'top' ? { x: along, y: 14 } : side === 'bottom' ? { x: along, y: current.layout.height - 14 }
        : side === 'left' ? { x: 12, y: along } : { x: current.layout.width - 12, y: along };
      const body = { x: candidate.x - 10, y: candidate.y - 12.5, right: candidate.x + 10, bottom: candidate.y + 12.5 };
      if (!current.obstacles.some(o => intersects(body, o))) { center = candidate; break; }
    }
    assert.ok(center, `Нет свободного края ${side}`);
    await page.evaluate(center => window.__smokeGame.scene.getScene('Room').player.body.reset(center.x, center.y - 10), center);
    await hold(key, 250);
    const b = (await state()).body;
    const coordinate = { top: b.y, bottom: b.bottom, left: b.x, right: b.right }[side];
    const expected = { top: 0, bottom: current.layout.height, left: 0, right: current.layout.width }[side];
    ok(Math.abs(coordinate - expected) < 1, `Граница поля удерживает друида: ${side}`);
  }

  await restart();
  await hold('ArrowRight', 350);
  const peaceful = await state();
  ok(!peaceful.combat && peaceful.health === 3, 'В текущей поляне нет жука, стрельбы и контактного урона');
  const oldSeed = peaceful.layout.seed;
  const oldLayout = JSON.stringify(peaceful.layout.obstacles);
  await restart();
  const regenerated = await state();
  ok(regenerated.layout.seed !== oldSeed && JSON.stringify(regenerated.layout.obstacles) !== oldLayout, 'R создаёт новое случайное окружение');
  ok(regenerated.x === regenerated.layout.spawn.x && regenerated.y === regenerated.layout.spawn.y, 'R возвращает друида к безопасному старту');

  for (const viewport of [{ width: 1280, height: 720 }, { width: 720, height: 900 }, { width: 1100, height: 820 }]) {
    await page.setViewportSize(viewport);
    await waitState(current => current.viewport.width === viewport.width && Math.abs(current.canvas.width - viewport.width) < 1 &&
      Math.abs(current.layout.height - 960 * viewport.height / viewport.width) < 1);
    await delay(80);
    assertMeadow(await state());
  }
  await page.keyboard.press('Escape');
  await waitScene('CharacterSelect');
  ok((await activeScenes()).join() === 'CharacterSelect', 'Esc возвращает в лагерь');
  for (let run = 0; run < 3; run++) {
    await page.keyboard.press('Enter');
    await waitScene('Room');
    assertMeadow(await state());
    await page.keyboard.press('Escape');
    await waitScene('CharacterSelect');
    await clickNamed('CharacterSelect', 'back');
    await waitScene('MainMenu');
    await clickNamed('MainMenu', 'play');
    await waitScene('CharacterSelect');
    ok((await activeScenes()).join() === 'CharacterSelect', `Повторные переходы без лишних сцен: ${run + 1}`);
  }
  ok(errors.length === 0, `Нет ошибок браузера: ${errors.join('; ')}`);
  console.log(`\nПроверок пройдено: ${passed}.`);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
