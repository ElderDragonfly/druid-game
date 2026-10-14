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
    return ['main-camp', 'selection-camp', 'druid-standing-detail', 'druid-camp-source', 'druid-game-source',
      'druid-left-source', 'druid-right-source', 'druid-back-source', 'druid-walk-down-source', 'druid-walk-up-source', 'druid-walk-left-source', 'druid-walk-right-source']
      .every(key => game.textures.exists(key) && game.textures.get(key).getSourceImage().width > 0);
  });
  ok(loaded, 'Фоны, подробный портрет и два простых образа друида загружены');
  const forestArt = await page.evaluate(async () => {
    const { ENVIRONMENT_VARIANTS } = await import('/src/data/environment.ts');
    const game = window.__smokeGame;
    const variants = ENVIRONMENT_VARIANTS.tree;
    const preserved = await Promise.all(variants.map(async art => {
      const image = new Image(); image.src = `/docs/art/conifer-trees-v1/sprites/${art.id}.png`; await image.decode();
      const texture = game.textures.get(art.texture), frame = texture.get(art.frame);
      const canvas = document.createElement('canvas'); canvas.width = art.width; canvas.height = art.height;
      const context = canvas.getContext('2d'); context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0); const expected = context.getImageData(0, 0, art.width, art.height).data;
      context.clearRect(0, 0, art.width, art.height);
      context.drawImage(texture.getSourceImage(), frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
        0, 0, art.width, art.height);
      const actual = context.getImageData(0, 0, art.width, art.height).data;
      return frame.cutWidth === art.width && frame.cutHeight === art.height &&
        texture.source[0].scaleMode === 1 && actual.every((value, index) => value === expected[index]);
    }));
    return { count: preserved.length, preserved: preserved.every(Boolean),
      oldTreesAbsent: !['meadow-tree-0','meadow-tree-1','meadow-tree-2','meadow-stump','meadow-bush-0','meadow-bush-1','meadow-bush-2','forest-rocks'].some(key => game.textures.exists(key)) };
  });
  ok(forestArt.count === 4 && forestArt.preserved, 'Кадры деревьев совпадают с текущими рабочими PNG; фильтр NEAREST');
  ok(forestArt.oldTreesAbsent, 'Камни, старые деревья, кусты и пень не загружаются');
  const mainBackground = await page.evaluate(() => {
    const scene = window.__smokeGame.scene.getScene('MainMenu');
    return { texture: scene.children.getByName('camp-background').getData('sourceTexture'),
      overlay: !!scene.children.getByName('main-character-preview') };
  });
  ok(mainBackground.texture === 'main-camp' && !mainBackground.overlay,
    'Главное меню использует прежнюю иллюстрацию без дополнительного сидящего спрайта');
  ok(await page.evaluate(() => !window.__smokeGame.scene.getScene('MainMenu').children.list.some(
    object => object.text === 'Лесной лагерь' || object.text === 'Лагерь в лесу')),
    'В главном меню убрана надпись про лесной лагерь');
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
      seatedHeight: scene.children.getByName('selected-character-preview').displayHeight,
      seatedWidth: scene.children.getByName('selected-character-preview').displayWidth,
      seatedX: scene.children.getByName('selected-character-preview').x,
      seatedY: scene.children.getByName('selected-character-preview').y,
      seatedPixelScale: scene.children.getByName('selected-character-preview').scaleX,
      seatedCharacterId: scene.children.getByName('selected-character-preview').getData('characterId'),
      name: scene.nameLabel.text,
      portrait: scene.children.getByName('character-druid').getByName('portrait-druid').texture.key,
    };
  });
  const slots = await selection();
  ok(slots.cards.length === 3 && slots.cards[0].enabled && !slots.cards[1].enabled && !slots.cards[2].enabled,
    'Три ячейки: крайняя левая доступна, остальные закрыты');
  ok(slots.preview === 'druid-camp' && slots.background === 'selection-camp' && slots.seatedCharacterId === slots.id,
    'На бревне сидит пиксельная версия выбранного друида');
  ok(slots.seatedWidth === 435 && slots.seatedHeight === 540 && slots.seatedX === 525 && slots.seatedY === 50 &&
    slots.seatedPixelScale === 0.625,
    'Правый лагерь из выбранного эскиза стоит в исходной композиции, за пределами панели кнопок');
  const campPixels = await page.evaluate(async () => {
    const canvas = window.__smokeGame.textures.get('druid-camp').getSourceImage();
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    // Phaser загружает текстуры через blob URL; эталон читаем независимо по выбранному пути.
    const source = new Image();
    source.src = '/docs/art/druid-detail-preview-v1/character-selection-preview.png';
    await source.decode();
    const reference = document.createElement('canvas');
    reference.width = 1536; reference.height = 1024;
    const context = reference.getContext('2d');
    context.drawImage(source, 0, 0);
    const approvedPixels = context.getImageData(840, 80, 696, 864).data;
    return { width: canvas.width, height: canvas.height,
      identical: data.length === approvedPixels.length && data.every((value, index) => value === approvedPixels[index]) };
  });
  ok(campPixels.width === 696 && campPixels.height === 864 && campPixels.identical,
    `Каждый пиксель лагеря совпадает с явно указанным PNG: без генерации, упрощения и изменения цветов (${JSON.stringify(campPixels)})`);
  ok(slots.portrait === 'druid-standing-detail', 'Ячейка доступного персонажа использует подробный рабочий образ');
  ok(slots.pixels.width === 384 && slots.pixels.height === 216, 'Пиксели фона выбора увеличены на четверть: 384×216 вместо 480×270');
  for (const id of ['character-locked-1', 'character-locked-2']) {
    await clickNamed('CharacterSelect', id);
    ok((await selection()).id === 'druid' && (await activeScenes()).join() === 'CharacterSelect', `Закрытую ячейку нельзя выбрать: ${id}`);
  }
  await clickNamed('CharacterSelect', 'character-druid');
  ok((await selection()).id === 'druid', 'Первый персонаж выбирается мышью');
  ok(await page.evaluate(() => {
    const scene = window.__smokeGame.scene.getScene('CharacterSelect');
    return !scene.chooseCharacter('locked-1') && !scene.chooseCharacter('missing') && scene.selectedId === 'druid';
  }), 'Выбор отклоняет закрытый и неизвестный ID даже при прямом вызове');
  // Только тест временно предоставляет второму персонажу собственную фигуру.
  // Настоящий обработчик клика проверяет смену изображения; данные затем восстанавливаются.
  const originalCard = await page.evaluateHandle(async () => {
    const { CHARACTERS } = await import('/src/data/characters.ts');
    const scene = window.__smokeGame.scene.getScene('CharacterSelect');
    const record = CHARACTERS[1];
    window.__choiceFixture = { record, original: { ...record } };
    const texture = scene.textures.createCanvas('_test-camp-variant', 40, 56);
    texture.context.fillStyle = '#b38b55';
    texture.context.fillRect(10, 5, 20, 48);
    texture.refresh();
    const gameTexture = scene.textures.createCanvas('_test-game-variant', 32, 40);
    gameTexture.context.fillStyle = '#b38b55';
    gameTexture.context.fillRect(8, 4, 12, 30);
    gameTexture.refresh();
    Object.assign(record, { available: true, name: 'Проверочный друид',
      camp: { ...CHARACTERS[0].camp, texture: '_test-camp-variant', scale: 2, position: { x: 806, y: 400 } },
      game: { texture: '_test-game-variant', metrics: { ...CHARACTERS[0].game.metrics, width: 32, height: 40, feetY: 34, scale: 1.5 } } });
    const card = scene.children.getByName('character-locked-1');
    scene.scene.restart();
    return card;
  });
  await page.waitForFunction(previous => window.__smokeGame.scene.getScene('CharacterSelect').children.getByName('character-locked-1') !== previous, originalCard);
  await originalCard.dispose();
  await delay(80);
  await clickNamed('CharacterSelect', 'character-locked-1');
  const switched = await selection();
  ok(switched.id === 'locked-1' && switched.preview === '_test-camp-variant' && switched.seatedCharacterId === 'locked-1' &&
    switched.name === 'Проверочный друид' && switched.seatedHeight === 112 && switched.seatedX === 806 && switched.seatedY === 400,
    'Клик по другому доступному персонажу меняет фигуру, её масштаб и подпись из данных');
  await clickNamed('CharacterSelect', 'start-run');
  await waitScene('Room');
  ok(await page.evaluate(() => {
    const scene = window.__smokeGame.scene.getScene('Room');
    return scene.characterId === 'locked-1' && scene.player.texture.key === '_test-game-variant' &&
      scene.player.displayWidth === 48 && scene.player.displayHeight === 60 &&
      scene.player.body.width === 20 && scene.player.body.height === 25;
  }), 'Игровая комната использует спрайт и масштаб выбранного персонажа из его данных');
  await page.keyboard.press('Escape');
  await waitScene('CharacterSelect');
  const fixtureCard = await page.evaluateHandle(() => {
    const scene = window.__smokeGame.scene.getScene('CharacterSelect');
    const fixture = window.__choiceFixture;
    delete fixture.record.camp;
    delete fixture.record.game;
    Object.assign(fixture.record, fixture.original);
    delete window.__choiceFixture;
    const card = scene.children.getByName('character-locked-1');
    scene.scene.restart();
    return card;
  });
  await page.waitForFunction(previous => window.__smokeGame.scene.getScene('CharacterSelect').children.getByName('character-locked-1') !== previous, fixtureCard);
  await fixtureCard.dispose();
  await delay(80);
  await page.evaluate(() => {
    window.__smokeGame.textures.remove('_test-camp-variant');
    window.__smokeGame.textures.remove('_test-game-variant');
  });
  const restored = await selection();
  ok(restored.id === 'druid' && restored.preview === 'druid-camp' && !restored.cards[1].enabled && !restored.cards[2].enabled,
    'После теста доступны только исходный друид и его фигура, остальные ячейки закрыты');
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

  const floorGeneration = await page.evaluate(async () => {
    const { generateForestFloor } = await import('/src/world/forestFloor.ts');
    const { forestFloorSample } = await import('/src/rendering/forestFloor.ts');
    const game = window.__smokeGame, scene = game.scene.getScene('Room');
    const sample = forestFloorSample(game.textures.get('forest-floor-source').getSourceImage());
    const fingerprint = pixels => {
      let hash = 2166136261;
      for (const value of pixels) hash = Math.imul(hash ^ value, 16777619);
      return hash >>> 0;
    };
    const a = generateForestFloor(sample, 320, 241, 123);
    const b = generateForestFloor(sample, 320, 241, 123);
    const c = generateForestFloor(sample, 320, 241, 124);
    const palette = new Set();
    const color = (pixels, index) => pixels[index] | pixels[index + 1] << 8 | pixels[index + 2] << 16;
    for (let i = 0; i < sample.pixels.length; i += 4) palette.add(color(sample.pixels, i));
    let originalColors = true, opaque = true;
    for (let i = 0; i < a.pixels.length; i += 4) {
      originalColors &&= palette.has(color(a.pixels, i));
      opaque &&= a.pixels[i + 3] === 255;
    }
    const uniform = new Uint8ClampedArray(128 * 128 * 4);
    for (let i = 0; i < uniform.length; i += 4) uniform.set([37, 59, 41, 255], i);
    const solid = generateForestFloor({ width: 128, height: 128, pixels: uniform }, 257, 193, 55);
    const uniformCovered = solid.pixels.every((value, i) => value === [37, 59, 41, 255][i % 4]);
    const hashes = new Set();
    for (let seed = 0; seed < 8; seed++) hashes.add(fingerprint(generateForestFloor(sample, 241, 193, seed).pixels));
    const floor = scene.children.getByName('forest-floor');
    const canvas = floor.texture.getSourceImage();
    const actual = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let covered = true;
    for (let i = 3; i < actual.length; i += 4) if (actual[i] !== 255) covered = false;
    return { repeatable: a.pixels.every((value, i) => value === b.pixels[i]),
      different: fingerprint(a.pixels) !== fingerprint(c.pixels) && hashes.size === 8,
      originalColors, opaque, uniformCovered, covered,
      source: floor.getData('sourceTexture'), seed: floor.getData('seed'), layoutSeed: scene.layout.seed,
      width: canvas.width, height: canvas.height, displayWidth: floor.displayWidth, displayHeight: floor.displayHeight,
      patches: floor.getData('patchCount'), nearest: floor.texture.source[0].scaleMode === 1,
      noStamp: !game.textures.exists('_forest-floor-stamp') };
  });
  ok(floorGeneration.repeatable && floorGeneration.different,
    'Подстилка воспроизводится по seed; разные seed дают разные рисунки');
  ok(floorGeneration.originalColors && floorGeneration.opaque && floorGeneration.uniformCovered,
    'Стыки сохраняют исходные цвета и непрозрачность, включая углы и неполные крайние фрагменты');
  ok(floorGeneration.source === 'forest-floor-source' && floorGeneration.seed === floorGeneration.layoutSeed &&
    floorGeneration.width === 1536 && floorGeneration.height === 864 && floorGeneration.displayWidth === 3840 &&
    floorGeneration.displayHeight === 2160 && floorGeneration.patches === 252 && floorGeneration.nearest && floorGeneration.covered,
    'Принятая подстилка покрывает весь мир: 252 случайных фрагмента, NEAREST, без прозрачных швов');
  ok(floorGeneration.noStamp, 'Временная текстура подстилки удалена после отрисовки');

  const state = () => page.evaluate(async () => {
    const { obstacleRect, obstacleVisualRect } = await import('/src/world/meadowLayout.ts');
    const game = window.__smokeGame;
    const scene = game.scene.getScene('Room');
    const p = scene.player;
    const rect = body => ({ x: body.x, y: body.y, width: body.width, height: body.height, right: body.right, bottom: body.bottom });
    const canvas = game.canvas.getBoundingClientRect();
    const view = scene.cameras.main.worldView;
    return {
      x: p.x, y: p.y, vx: p.body.velocity.x, vy: p.body.velocity.y, facing: scene.facing, frame: p.frame.name,
      animationPlaying: p.anims.isPlaying, animationKey: p.anims.currentAnim?.key,
      body: rect(p.body), health: scene.playerHealth,
      healthLabel: scene.hud.getByName('health-label').text,
      layout: scene.layout,
      expectedBodies: scene.layout.obstacles.map(obstacleRect),
      expectedImages: scene.layout.obstacles.map(obstacleVisualRect),
      obstacles: scene.world.obstacles.getChildren().map(object => ({ kind: object.getData('kind'), ...rect(object.body),
        texture: object.texture.key, frame: object.frame.name, imageBounds: { x: object.getBounds().x, y: object.getBounds().y,
          width: object.displayWidth, height: object.displayHeight } })),
      colliders: scene.physics.world.colliders.getActive().length,
      view: { x: view.x, y: view.y, width: view.width, height: view.height },
      hudView: { x: scene.hudCamera.worldView.x, y: scene.hudCamera.worldView.y, zoom: scene.hudCamera.zoom,
        width: scene.hudCamera.width, height: scene.hudCamera.height },
      cameraCount: scene.cameras.cameras.length,
      cameraCenter: { x: scene.cameras.main.midPoint.x, y: scene.cameras.main.midPoint.y },
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
    const { obstacles, layout, ...current } = await state();
    throw new Error(`Игровое состояние не достигнуто: ${JSON.stringify(current)}`);
  };
  const intersects = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
  const assertMeadow = current => {
    const { canvas, viewport, view, layout } = current;
    ok(Math.abs(canvas.x) < 1 && Math.abs(canvas.y) < 1 && Math.abs(canvas.width - viewport.width) < 1 &&
      Math.abs(canvas.height - viewport.height) < 1, `Поле занимает всё окно ${viewport.width}×${viewport.height}`);
    ok(layout.width === 3840 && layout.height === 2160 && Math.abs(view.height - 720) < 1 &&
      view.width < layout.width && view.x >= -0.01 && view.y >= -0.01 &&
      view.x + view.width <= layout.width + 0.01 && view.y + view.height <= layout.height + 0.01,
      'Мир 3840×2160; камера показывает часть локации и не выходит за её границы');
    ok(current.hudView.zoom === 1 && current.hudView.x === 0 && current.hudView.y === 0 &&
      current.hudView.width === viewport.width && current.hudView.height === viewport.height && current.cameraCount === 2,
      'HP закреплены на экране отдельной камерой без масштаба; камер ровно две');
    ok(current.obstacles.every((body, i) => {
      const object = layout.obstacles[i], expected = current.expectedBodies[i], image = current.expectedImages[i];
      return body.kind === object.kind && body.width === expected.width && body.height === expected.height &&
        Math.abs(body.x - expected.x) < 0.1 && Math.abs(body.y - expected.y) < 0.1 &&
        Math.abs(body.imageBounds.x - image.x) < 0.1 && Math.abs(body.imageBounds.y - image.y) < 0.1 &&
        body.imageBounds.width === image.width && body.imageBounds.height === image.height &&
        body.texture === `forest-${object.kind === 'tree' ? 'trees' : 'rocks'}`;
    }), 'Спрайты из каталога имеют правильный масштаб, точку опоры и физическое основание');
    ok(!current.obstacles.some(body => intersects(current.body, body)), 'Друид появляется в свободном месте');
    ok(current.colliders === 1, `Столкновения подключены один раз: ${current.colliders}`);
  };

  const generation = await page.evaluate(async () => {
    const { generateMeadow, obstacleRect, obstacleVisualRect, overlaps } = await import('/src/world/meadowLayout.ts');
    const failures = []; const treeCounts = new Set();
    const treeVariants = new Set();
    let interiorTrees = 0; let totalTrees = 0;
    for (let seed = 0; seed < 2000; seed++) {
      const layout = generateMeadow(seed); const { width, height } = layout;
      const trees = layout.obstacles.filter(o => o.kind === 'tree');
      trees.forEach(o => treeVariants.add(o.variant));
      treeCounts.add(trees.length); totalTrees += trees.length;
      interiorTrees += trees.filter(o => o.x > width * 0.25 && o.x < width * 0.75 &&
        o.y > height * 0.25 && o.y < height * 0.75).length;
      const spawn = { x: layout.spawn.x - 10, y: layout.spawn.y - 2.5, width: 20, height: 25 };
      if (width !== 3840 || height !== 2160 || trees.length < 45 || trees.length > 63 ||
        trees.length !== layout.counts.trees ||
        layout.obstacles.length !== trees.length || layout.spawn.x !== width / 2 || layout.spawn.y !== height / 2 ||
        layout.obstacles.some((object, i) => {
          const r = obstacleRect(object), visual = obstacleVisualRect(object);
          return visual.x < 0 || visual.y < 0 || visual.x + visual.width > width || visual.y + visual.height > height || overlaps(visual, spawn) || r.x < 0 || r.y < 0 || r.x + r.width > width || r.y + r.height > height || overlaps(r, spawn) ||
            layout.obstacles.slice(i + 1).some(other => overlaps(r, obstacleRect(other), 27));
        })) failures.push(seed);
    }
    return { failures, treeVariants: [...treeVariants].sort((a,b) => a-b),
      treeCounts: [...treeCounts].sort((a, b) => a - b),
      interiorFraction: interiorTrees / totalTrees,
      repeatable: JSON.stringify(generateMeadow(123)) === JSON.stringify(generateMeadow(123)),
      different: JSON.stringify(generateMeadow(123).obstacles) !== JSON.stringify(generateMeadow(124).obstacles),
    };
  });
  ok(generation.failures.length === 0, `2000 планировок: 45–63 дерева, нет старых растений; безопасный центр и непересекающиеся препятствия (${generation.failures})`);
  ok(generation.treeCounts.join() === Array.from({ length: 19 }, (_, i) => i + 45).join(),
    'Генерация использует все допустимые количества деревьев, включая границы диапазонов');
  ok(generation.interiorFraction > 0.2 && generation.interiorFraction < 0.35,
    'Деревья распределены и внутри локации, без прежнего уплотнения только по краям');
  ok(generation.repeatable && generation.different, 'Одинаковый seed воспроизводит поляну, другой меняет окружение');
  ok(generation.treeVariants.join() === '0,1,2,3',
    'Все четыре текущих вида деревьев участвуют в случайной генерации');

  const followMath = await page.evaluate(async () => {
    const { EllipticalFollowCamera } = await import('/src/camera/EllipticalFollowCamera.ts');
    const make = () => { const f = new EllipticalFollowCamera(3840, 2160, 192, 108, 140); f.resize(1280, 720); return f; };
    const inside = make(); inside.update(2080, 1130, 16);
    const diagonal = make(); diagonal.update(2020, 1180, 16);
    const a = make(), b = make();
    for (let i = 0; i < 60; i++) a.update(2200, 1080, 1000 / 60);
    for (let i = 0; i < 30; i++) b.update(2200, 1080, 1000 / 30);
    const atEdge = make(); for (let i = 0; i < 120; i++) atEdge.update(2200, 1080, 1000 / 60);
    const before = { ...atEdge.center }; for (let i = 0; i < 120; i++) atEdge.update(2200, 1080, 1000 / 60);
    return {
      inside: inside.center.x === 1920 && inside.center.y === 1080,
      ellipse: diagonal.center.x > 1920 && diagonal.center.y > 1080 &&
        Math.abs((diagonal.center.x - 1920) - (diagonal.center.y - 1080)) < 0.001,
      smooth: a.center.x < 2200 - 192 && a.center.x > 1920,
      frameIndependent: Math.abs(a.center.x - b.center.x) < 0.01,
      settled: Math.abs(Math.hypot(2200 - atEdge.center.x, 1080 - atEdge.center.y) - 192) < 0.01 &&
        before.x === atEdge.center.x && before.y === atEdge.center.y,
    };
  });
  ok(followMath.inside && followMath.ellipse, 'Зона — овал 16:9 с полуосями 192×108: внутри камера стоит, за овальной границей следует');
  ok(followMath.smooth && followMath.frameIndependent, 'Сглаживание догоняет постепенно и не зависит от частоты кадров');
  ok(followMath.settled, 'После остановки камера завершает догоняющее движение у края овала и не центрирует героя');
  ok(await page.locator('canvas').count() === 1, 'Одна игровая сцена отрисована');
  const initial = await state();
  ok(initial.health === 3 && initial.healthLabel === 'HP 3/3', 'Друид сохраняет 3 HP и счётчик');
  const gameArt = await page.evaluate(() => {
    const scene = window.__smokeGame.scene.getScene('Room');
    const sprite = scene.player;
    const canvas = sprite.texture.getSourceImage();
    const pixels = canvas.getContext('2d').getImageData(sprite.frame.cutX, sprite.frame.cutY, sprite.width, sprite.height).data;
    const colors = new Set();
    let transparent = 0;
    let opaque = 0;
    let translucent = 0;
    let lastOpaqueY = -1;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 0) transparent++;
      else {
        if (pixels[i + 3] === 255) opaque++; else translucent++;
        colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
        lastOpaqueY = Math.floor(i / 4 / sprite.width);
      }
    }
    return { key: sprite.texture.key, width: sprite.width, height: sprite.height, colors: colors.size,
      transparent, opaque, translucent, displayWidth: sprite.displayWidth, displayHeight: sprite.displayHeight,
      bodyWidth: sprite.body.width, bodyHeight: sprite.body.height, centerX: sprite.body.x + sprite.body.width / 2 - sprite.x,
      centerY: sprite.body.y + sprite.body.height / 2 - sprite.y,
      feetOffset: (lastOpaqueY + 1 - sprite.displayOriginY) * sprite.scaleY,
      bodyFeetOffset: sprite.body.bottom - sprite.y, pixelSize: sprite.scaleY };
  });
  ok(gameArt.key === 'druid-game' && gameArt.width === 64 && gameArt.height === 80 && gameArt.colors > 256,
    'Друид использует выбранный спрайт 64×80 без нового ограничения палитры');
  ok(gameArt.transparent > 2000 && gameArt.opaque > 1500 && gameArt.translucent === 0,
    'Спрайт имеет прозрачные поля и чёткие непрозрачные пиксели');
  ok(Math.abs(gameArt.displayWidth - 87.5) < 0.01 && Math.abs(gameArt.displayHeight - 109.375) < 0.01,
    'После повышения детализации размер игрового друида сохраняется: 87,5×109,375');
  ok(Math.abs(gameArt.feetOffset - gameArt.bodyFeetOffset) <= gameArt.pixelSize + 0.01,
    'После увеличения ноги совпадают с нижним краем физического тела в пределах одного пикселя спрайта');
  ok(Math.abs(gameArt.bodyWidth - 20) < 0.01 && Math.abs(gameArt.bodyHeight - 25) < 0.01 &&
    Math.abs(gameArt.centerX) < 0.01 && Math.abs(gameArt.centerY - 10) < 0.01, 'Физическое тело 20×25 сохраняет положение относительно ног');
  const directionalArt = await page.evaluate(async () => {
    const texture = window.__smokeGame.textures.get('druid-game');
    const atlas = texture.getSourceImage().getContext('2d');
    const sources = {
      down: '/docs/art/druid-front-resolution-v1/druid-front-64x80.png',
      left: '/src/assets/characters/druid-left-64x80.png',
      right: '/src/assets/characters/druid-right-64x80.png',
      up: '/src/assets/characters/druid-back-64x80.png',
    };
    return Promise.all(Object.entries(sources).map(async ([direction, path]) => {
      const image = new Image(); image.src = path; await image.decode();
      const reference = document.createElement('canvas'); reference.width = 64; reference.height = 80;
      const context = reference.getContext('2d'); context.drawImage(image, 0, 0);
      const expected = context.getImageData(0, 0, 64, 80).data;
      const frame = texture.get(direction);
      const actual = atlas.getImageData(frame.cutX, frame.cutY, 64, 80).data;
      const preserved = expected.length === actual.length && actual.every((value, index) => value === expected[index]);
      let signature = 2166136261;
      let lastY = -1;
      for (let i = 0; i < actual.length; i++) signature = Math.imul(signature ^ actual[i], 16777619);
      for (let i = 3; i < actual.length; i += 4) if (actual[i]) lastY = Math.floor(i / 4 / 64);
      return { direction, preserved, width: frame.width, height: frame.height, signature, feetY: lastY + 1 };
    }));
  });
  ok(directionalArt.length === 4 && directionalArt.every(view => view.preserved && view.width === 64 && view.height === 80),
    'Все четыре кадра точно совпадают с соответствующими отдельными PNG 64×80');
  ok(new Set(directionalArt.map(view => view.signature)).size === 4 && directionalArt.every(view => view.feetY === 75),
    'Ракурсы различаются; все четыре фигуры имеют общую опору ног на строке 75');
  ok(initial.facing === 'down' && initial.frame === 'down', 'При входе друид стоит лицом к игроку');
  assertMeadow(initial);
  await page.screenshot({ path: fileURLToPath(new URL('../test-results/room.png', import.meta.url)) });

  // A collision-free corridor isolates the camera behavior from random trees.
  const cameraCorridor = await page.evaluate(() => {
    const scene = window.__smokeGame.scene.getScene('Room');
    const obstacles = scene.world.obstacles.getChildren().map(object => object.body);
    for (const offset of [0, 80, -80, 160, -160, 240, -240]) {
      const x = 1920, y = 1080 + offset;
      const r = { x: x - 10, right: x + 500, y: y - 12.5, bottom: y + 12.5 };
      if (obstacles.some(o => r.x < o.right && r.right > o.x && r.y < o.bottom && r.bottom > o.y)) continue;
      scene.player.body.reset(x, y - 10);
      scene.cameraFollow.center.x = x; scene.cameraFollow.center.y = y - 10;
      scene.cameras.main.centerOn(x, y - 10);
      return true;
    }
    return false;
  });
  assert.ok(cameraCorridor, 'Нет свободного прохода для проверки камеры');
  await delay(60);
  const beforeCamera = await state();
  await hold('d', 250);
  const insideCamera = await state();
  ok(insideCamera.x > beforeCamera.x + 40 && insideCamera.x < beforeCamera.x + 80 &&
    Math.abs(insideCamera.view.x - beforeCamera.view.x) < 0.01 && Math.abs(insideCamera.view.y - beforeCamera.view.y) < 0.01,
    'Друид свободно движется внутри овала, камера остаётся на месте');
  await page.keyboard.down('d'); await delay(1000);
  const followingCamera = await state();
  const followDistance = Math.hypot(followingCamera.x - followingCamera.cameraCenter.x,
    followingCamera.y - followingCamera.cameraCenter.y);
  ok(followingCamera.view.x > beforeCamera.view.x + 40 && followDistance > 192 && followDistance < 250,
    'За овалом камера плавно движется за героем с небольшим отставанием');
  await page.keyboard.up('d');
  const stoppedCamera = await waitState(current => Math.abs(Math.hypot(current.x - current.cameraCenter.x,
    current.y - current.cameraCenter.y) - 192) < 0.02);
  await delay(300); const settledCamera = await state();
  ok(Math.abs(settledCamera.cameraCenter.x - stoppedCamera.cameraCenter.x) < 0.03 &&
    Math.hypot(settledCamera.x - settledCamera.cameraCenter.x,
      settledCamera.y - settledCamera.cameraCenter.y) > 191,
    'После догоняющего движения камера стоит у границы овала, не возвращает героя в центр');
  await hold('a', 250); const returnedInside = await state();
  ok(Math.abs(returnedInside.cameraCenter.x - settledCamera.cameraCenter.x) < 0.01,
    'Обратное движение внутрь овала снова оставляет камеру неподвижной');
  ok(returnedInside.healthLabel === 'HP 3/3' && returnedInside.hudView.x === 0 && returnedInside.hudView.y === 0,
    'HP остаются на экране во время движения камеры');

  const walkPixels = await page.evaluate(async () => {
    const image = new Image(); image.src = '/docs/art/druid-walk-down-v2/walk-down-64x80.png'; await image.decode();
    const texture = window.__smokeGame.textures.get('druid-walk-down-source');
    const read = source => {
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 80;
      const context = canvas.getContext('2d'); context.drawImage(source, 0, 0);
      return context.getImageData(0, 0, 256, 80).data;
    };
    const expected = read(image); const actual = read(texture.getSourceImage());
    return actual.every((value, index) => value === expected[index]);
  });
  ok(walkPixels, 'Цикл ходьбы использует каждый пиксель принятого PNG без перерисовки или уменьшения');

  // Длинный свободный проход нужен, чтобы препятствие не прервало проверяемый цикл.
  const corridorStart = await page.evaluate(() => {
    const scene = window.__smokeGame.scene.getScene('Room');
    const obstacles = scene.world.obstacles.getChildren().map(object => object.body);
    for (let y = 50; y < scene.layout.height - 250; y += 20) {
      for (let x = 30; x < scene.layout.width - 30; x += 20) {
        const corridor = { x: x - 10, y: y - 12.5, right: x + 10, bottom: y + 230 };
        if (obstacles.some(o => corridor.x < o.right && corridor.right > o.x && corridor.y < o.bottom && corridor.bottom > o.y)) continue;
        scene.player.body.reset(x, y - 10);
        return true;
      }
    }
    return false;
  });
  assert.ok(corridorStart, 'Нет свободного прохода для проверки цикла');
  await page.keyboard.down('s');
  await waitState(current => current.animationPlaying && current.animationKey === 'druid-walk-down');
  const walkCycle = await page.evaluate(async () => {
    const scene = window.__smokeGame.scene.getScene('Room'); const p = scene.player;
    const frames = []; const startY = p.y; const startTime = performance.now();
    let geometryPreserved = true;
    while (performance.now() - startTime < 850) {
      if (frames.at(-1) !== p.frame.name) frames.push(p.frame.name);
      geometryPreserved &&= p.width === 64 && p.height === 80 && p.body.width === 20 && p.body.height === 25 &&
        Math.abs(p.displayWidth - 87.5) < 0.01 && Math.abs(p.displayHeight - 109.375) < 0.01 &&
        Math.abs((75 - p.displayOriginY) * p.scaleY - 22.5) < 0.01;
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return { frames, geometryPreserved, distance: p.y - startY, playing: p.anims.isPlaying };
  });
  const indices = walkCycle.frames.map(frame => Number(frame.replace('walk-down-', '')));
  ok(new Set(indices).size === 4 && indices.length >= 5 && indices.every((value, index) =>
    value >= 0 && value < 4 && (!index || value === (indices[index - 1] + 1) % 4)),
    `Удержание S последовательно проигрывает все четыре кадра и повторяет цикл: ${walkCycle.frames.join(', ')}`);
  ok(walkCycle.playing && walkCycle.distance > 150 && walkCycle.geometryPreserved,
    'Друид движется во время анимации; размер, опора ног и физическое тело остаются прежними');
  await page.keyboard.up('s');
  const idleAfterWalk = await waitState(current => !current.animationPlaying && current.frame === 'down' && current.vy === 0);
  ok(idleAfterWalk.facing === 'down', 'Отпускание S останавливает цикл и возвращает стоящий фронтальный спрайт');

  const upWalkPixels = await page.evaluate(async () => {
    const image = new Image(); image.src = '/docs/art/druid-walk-other-directions-v1/walk-up-64x80.png'; await image.decode();
    const texture = window.__smokeGame.textures.get('druid-walk-up-source');
    const read = source => {
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 80;
      const context = canvas.getContext('2d'); context.drawImage(source, 0, 0);
      return context.getImageData(0, 0, 256, 80).data;
    };
    const expected = read(image); const actual = read(texture.getSourceImage());
    return actual.every((value, index) => value === expected[index]);
  });
  ok(upWalkPixels, 'Ходьба вверх использует принятый PNG без изменения пикселей');
  const upCorridor = await page.evaluate(() => {
    const scene = window.__smokeGame.scene.getScene('Room');
    const obstacles = scene.world.obstacles.getChildren().map(object => object.body);
    for (let y = 250; y < scene.layout.height - 30; y += 20) {
      for (let x = 30; x < scene.layout.width - 30; x += 20) {
        const corridor = { x: x - 10, y: y - 230, right: x + 10, bottom: y + 12.5 };
        if (obstacles.some(o => corridor.x < o.right && corridor.right > o.x && corridor.y < o.bottom && corridor.bottom > o.y)) continue;
        scene.player.body.reset(x, y - 10);
        return true;
      }
    }
    return false;
  });
  assert.ok(upCorridor, 'Нет свободного прохода для проверки ходьбы вверх');
  await page.keyboard.down('w');
  await waitState(current => current.animationPlaying && current.animationKey === 'druid-walk-up');
  const upCycle = await page.evaluate(async () => {
    const p = window.__smokeGame.scene.getScene('Room').player;
    const frames = []; const startY = p.y; const startTime = performance.now();
    let geometryPreserved = true;
    while (performance.now() - startTime < 850) {
      if (frames.at(-1) !== p.frame.name) frames.push(p.frame.name);
      geometryPreserved &&= p.width === 64 && p.height === 80 && p.body.width === 20 && p.body.height === 25 &&
        Math.abs(p.displayWidth - 87.5) < 0.01 && Math.abs(p.displayHeight - 109.375) < 0.01 &&
        Math.abs((75 - p.displayOriginY) * p.scaleY - 22.5) < 0.01;
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return { frames, geometryPreserved, distance: startY - p.y, playing: p.anims.isPlaying };
  });
  const upIndices = upCycle.frames.map(frame => Number(frame.replace('walk-up-', '')));
  ok(new Set(upIndices).size === 4 && upIndices.length >= 5 && upIndices.every((value, index) =>
    value >= 0 && value < 4 && (!index || value === (upIndices[index - 1] + 1) % 4)),
    `Удержание W проигрывает и повторяет четыре кадра: ${upCycle.frames.join(', ')}`);
  ok(upCycle.playing && upCycle.distance > 150 && upCycle.geometryPreserved,
    'Во время ходьбы вверх сохраняются движение, размер, опора ног и физическое тело');
  // Проверяем переключение между активными циклами без остановки движения.
  await page.keyboard.down('d');
  const rightDuringWalk = await waitState(current => current.facing === 'right' && current.animationKey === 'druid-walk-right' && current.animationPlaying);
  ok(rightDuringWalk.vx > 0, 'Переход с W на W+D переключает ходьбу вверх на принятый цикл вправо');
  await page.keyboard.up('d');
  await waitState(current => current.animationPlaying && current.animationKey === 'druid-walk-up');
  await page.keyboard.up('w');
  const idleAfterUp = await waitState(current => !current.animationPlaying && current.frame === 'up' && current.vy === 0);
  ok(idleAfterUp.facing === 'up', 'Отпускание W возвращает стоящий вид со спины');

  for (const { key, direction, sign, folder } of [
    { key: 'a', direction: 'left', sign: -1, folder: 'druid-walk-left-v3' },
    { key: 'd', direction: 'right', sign: 1, folder: 'druid-walk-right-v1' },
  ]) {
    const walkPixels = await page.evaluate(async ({ direction, folder }) => {
      const image = new Image(); image.src = `/docs/art/${folder}/walk-${direction}-64x80.png`; await image.decode();
      const texture = window.__smokeGame.textures.get(`druid-walk-${direction}-source`);
      const read = source => {
        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 80;
        const context = canvas.getContext('2d'); context.drawImage(source, 0, 0);
        return context.getImageData(0, 0, 256, 80).data;
      };
      const expected = read(image); const actual = read(texture.getSourceImage());
      return actual.every((value, index) => value === expected[index]);
    }, { direction, folder });
    ok(walkPixels, `${direction}: игра использует каждый пиксель PNG, подготовленного из принятой GIF`);
    const corridorFound = await page.evaluate(sign => {
      const scene = window.__smokeGame.scene.getScene('Room');
      const obstacles = scene.world.obstacles.getChildren().map(object => object.body);
      for (let y = 30; y < scene.layout.height - 30; y += 20) {
        for (let x = sign < 0 ? 250 : 30; x < scene.layout.width - (sign < 0 ? 30 : 250); x += 20) {
          const corridor = { x: x - (sign < 0 ? 230 : 10), y: y - 12.5,
            right: x + (sign < 0 ? 10 : 230), bottom: y + 12.5 };
          if (obstacles.some(o => corridor.x < o.right && corridor.right > o.x && corridor.y < o.bottom && corridor.bottom > o.y)) continue;
          scene.player.body.reset(x, y - 10);
          return true;
        }
      }
      return false;
    }, sign);
    assert.ok(corridorFound, `Нет свободного прохода для проверки ${direction}`);
    await page.keyboard.down(key);
    await waitState(current => current.animationPlaying && current.animationKey === `druid-walk-${direction}`);
    const cycle = await page.evaluate(async sign => {
      const p = window.__smokeGame.scene.getScene('Room').player;
      const frames = []; const startX = p.x; const startTime = performance.now();
      let geometryPreserved = true;
      while (performance.now() - startTime < 850) {
        if (frames.at(-1) !== p.frame.name) frames.push(p.frame.name);
        geometryPreserved &&= p.width === 64 && p.height === 80 && p.body.width === 20 && p.body.height === 25 &&
          Math.abs(p.displayWidth - 87.5) < 0.01 && Math.abs(p.displayHeight - 109.375) < 0.01 &&
          Math.abs((75 - p.displayOriginY) * p.scaleY - 22.5) < 0.01;
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      return { frames, geometryPreserved, distance: (p.x - startX) * sign, playing: p.anims.isPlaying };
    }, sign);
    const indices = cycle.frames.map(frame => Number(frame.replace(`walk-${direction}-`, '')));
    ok(new Set(indices).size === 4 && indices.length >= 5 && indices.every((value, index) =>
      value >= 0 && value < 4 && (!index || value === (indices[index - 1] + 1) % 4)),
      `Удержание ${key.toUpperCase()} повторяет четыре кадра: ${cycle.frames.join(', ')}`);
    ok(cycle.playing && cycle.distance > 150 && cycle.geometryPreserved,
      `${direction}: сохраняются размер, движение, опора ног и физическое тело`);
    await page.keyboard.up(key);
    const idle = await waitState(current => !current.animationPlaying && current.frame === direction && current.vx === 0);
    ok(idle.facing === direction, `Отпускание ${key.toUpperCase()} возвращает стоящий спрайт ${direction}`);
  }

  for (const [key, axis, sign] of [['w', 'y', -1], ['s', 'y', 1], ['a', 'x', -1], ['d', 'x', 1]]) {
    await restart();
    const before = await state();
    await page.keyboard.down(key);
    await waitState(current => (current[axis] - before[axis]) * sign > 25);
    await page.keyboard.up(key);
    const after = await waitState(current => current.vx === 0 && current.vy === 0);
    ok((after[axis] - before[axis]) * sign > 25, `WASD: движение на ${key.toUpperCase()}`);
    const expectedFacing = { w: 'up', s: 'down', a: 'left', d: 'right' }[key];
    ok(after.facing === expectedFacing && after.frame === expectedFacing && after.body.width === 20 && after.body.height === 25,
      `Клавиша ${key.toUpperCase()} включает свой ракурс, сохраняемый после остановки; тело остаётся 20×25`);
    await delay(150);
    ok(Math.abs((await state())[axis] - after[axis]) < 2, `Остановка после отпускания ${key.toUpperCase()}`);
  }
  await restart();
  await page.keyboard.down('s');
  await page.keyboard.down('d');
  await delay(100);
  const diagonal = await state();
  ok(Math.abs(Math.hypot(diagonal.vx, diagonal.vy) - 220) < 0.1, 'Диагональ не увеличивает скорость');
  ok(diagonal.facing === 'right' && diagonal.animationPlaying && diagonal.animationKey === 'druid-walk-right', 'При S+D последняя нажатая D включает ходьбу вправо');
  await page.keyboard.up('d');
  const remaining = await waitState(current => current.animationPlaying && current.animationKey === 'druid-walk-down' && current.vx === 0);
  ok(remaining.facing === 'down', 'После отпускания D удерживаемая S включает ходьбу вниз');
  await page.keyboard.down('w');
  await waitState(current => current.vx === 0 && current.vy === 0);
  const canceled = await state();
  ok(canceled.frame === 'down', 'Противоположные W+S останавливают движение и сохраняют последний ракурс');
  await page.keyboard.up('s');
  await waitState(current => current.animationPlaying && current.animationKey === 'druid-walk-up');
  await page.keyboard.up('w');
  const stopped = await waitState(current => current.vx === 0 && current.vy === 0);
  ok(stopped.frame === 'up', 'После отпускания клавиш сохраняется вид со спины');
  await page.keyboard.up('s');
  await page.keyboard.up('d');

  // Меняем только стартовую позицию. Настоящие клавиши и коллайдеры остаются включёнными.
  for (const kind of ['tree']) {
    await restart();
    for (const [key, axis, sign] of [['d', 'x', 1], ['a', 'x', -1], ['s', 'y', 1], ['w', 'y', -1]]) {
      const current = await state();
      let fixture;
      for (const distance of [26, 12, 2]) {
        for (const obstacle of current.obstacles.filter(item => item.kind === kind)) {
          const center = { x: (obstacle.x + obstacle.right) / 2, y: (obstacle.y + obstacle.bottom) / 2 };
          if (axis === 'x') center.x = sign > 0 ? obstacle.x - 10 - distance : obstacle.right + 10 + distance;
          else center.y = sign > 0 ? obstacle.y - 12.5 - distance : obstacle.bottom + 12.5 + distance;
          const body = { x: center.x - 10, y: center.y - 12.5, right: center.x + 10, bottom: center.y + 12.5 };
          // Свободным должен быть весь подход, а не только старт: иначе соседнее препятствие
          // может остановить героя до дерева и случайно провалить проверку дерева.
          const corridor = { ...body };
          if (axis === 'x') {
            if (sign > 0) corridor.right += distance; else corridor.x -= distance;
          } else {
            if (sign > 0) corridor.bottom += distance; else corridor.y -= distance;
          }
          if (body.x >= 0 && body.y >= 0 && body.right <= current.layout.width && body.bottom <= current.layout.height &&
            !current.obstacles.some(other => other !== obstacle && intersects(corridor, other)) && !intersects(body, obstacle)) {
            fixture = { obstacle, center, distance }; break;
          }
        }
      if (fixture) break;
      }
      assert.ok(fixture, `Нет свободного подхода ${kind} ${key}`);
      await page.evaluate(center => {
        const scene = window.__smokeGame.scene.getScene('Room');
        scene.player.body.reset(center.x, center.y - 10);
        scene.player.setVelocity(0, 0);
      }, fixture.center);
      const before = await state();
      {
        await page.keyboard.down(key);
        await waitState(current => !current.animationPlaying && Math.abs(axis === 'x'
          ? (sign > 0 ? current.body.right - fixture.obstacle.x : current.body.x - fixture.obstacle.right)
          : (sign > 0 ? current.body.bottom - fixture.obstacle.y : current.body.y - fixture.obstacle.bottom)) < 1);
        ok(!(await state()).animationPlaying, `Упор в ${kind} останавливает ходьбу при удержании ${key.toUpperCase()}`);
        await page.keyboard.up(key);
      }
      await hold(key, 450);
      const after = await state();
      const o = fixture.obstacle;
      const edge = axis === 'x' ? (sign > 0 ? after.body.right - o.x : after.body.x - o.right)
        : (sign > 0 ? after.body.bottom - o.y : after.body.y - o.bottom);
      ok(Math.abs(edge) < 1 && (after[axis] - before[axis]) * sign > fixture.distance - 1 && !intersects(after.body, o),
        `Препятствие ${kind} блокирует реальное движение ${key.toUpperCase()}${Math.abs(edge) >= 1 ? `: ${JSON.stringify({ fixture, before: before.body, after: after.body, edge })}` : ''}`);
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
    const bounded = await waitState(current => {
      const v = current.view;
      return Math.abs(({ top: v.y, bottom: v.y + v.height, left: v.x, right: v.x + v.width })[side] - expected) < 0.1;
    });
    ok(bounded.view.x >= -0.01 && bounded.view.y >= -0.01 && bounded.view.x + bounded.view.width <= 3840.01 &&
      bounded.view.y + bounded.view.height <= 2160.01, `Камера ограничена краем мира: ${side}`);
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

  const beforeResize = await state();
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 540 }, { width: 720, height: 900 }, { width: 1100, height: 820 }]) {
    await page.setViewportSize(viewport);
    await waitState(current => current.viewport.width === viewport.width && Math.abs(current.canvas.width - viewport.width) < 1 &&
      Math.abs(current.view.width - viewport.width * 720 / viewport.height) < 1 && Math.abs(current.view.height - 720) < 1 &&
      current.hudView.width === viewport.width && current.hudView.height === viewport.height);
    await delay(80);
    const resized = await state();
    assertMeadow(resized);
    ok(JSON.stringify(resized.layout) === JSON.stringify(beforeResize.layout) && resized.x === beforeResize.x && resized.y === beforeResize.y,
      'Изменение окна сохраняет seed, препятствия, размеры мира и положение героя');
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
} catch (error) {
  console.error('Ошибки браузера при сбое:', errors);
  throw error;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
