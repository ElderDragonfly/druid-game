import { testMushroomInteraction } from './mushroom-interaction-smoke.mjs';
import { testFallenLogs } from './fallen-logs-smoke.mjs';
import assert from 'node:assert/strict';
import { testCampAtmosphere } from './camp-atmosphere-smoke.mjs';
import { testWolf } from './wolf-smoke.mjs';
import { testDruidHits } from './druid-hit-smoke.mjs';
import { testAcornAttack } from './acorn-smoke.mjs';
import { testWolfCombat } from './wolf-combat-smoke.mjs';
import { testWolfPack } from './wolf-pack-smoke.mjs';
import { testAcornRange } from './acorn-range-smoke.mjs';
import { testMenuWindow } from './menu-window-smoke.mjs';
import { testMenuSession } from './menu-session-smoke.mjs';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tools/smoke.vite.config.ts', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
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
  // Legacy druid/camera fixtures isolate the new enemy; wolf scenarios below enable it explicitly.
  const isolateWolf = () => page.evaluate(() => {
    const wolves = window.__smokeGame.scene.getScene('Room')?.world?.wolves ?? [];
    for (const wolf of wolves)
    if (wolf?.scene) { wolf.setActive(false).setVisible(false).setVelocity(0, 0); wolf.body.enable = false; wolf.shadow.setVisible(false); }
  });
  const waitScene = async key => { await page.waitForFunction(sceneKey => {
    const game = window.__smokeGame;
    const active = game.scene.getScenes(true);
    return active.length === 1 && active[0].sys.settings.key === sceneKey &&
      (sceneKey !== 'Room' || active[0].world && active[0].physics.world.colliders.getActive().length === active[0].world.mice.length + 1 + active[0].world.wolves.length * 2);
  }, key); if (key === 'Room') await isolateWolf(); };
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
      const camera = scene.cameras.getCamera('menu-ui') ?? scene.cameras.main;
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
    return ['main-camp', 'selection-camp', 'druid-standing-detail', 'druid-basic-detail', 'druid-camp-source', 'druid-game-source',
      'druid-left-source', 'druid-right-source', 'druid-back-source', 'druid-walk-down-source', 'druid-walk-up-source', 'druid-walk-left-source', 'druid-walk-right-source', ...['down-left', 'down-right', 'up-left', 'up-right'].flatMap(d => [`druid-${d}-source`, `druid-walk-${d}-source`])]
      .every(key => game.textures.exists(key) && game.textures.get(key).getSourceImage().width > 0);
  });
  ok(loaded, 'Фоны, подробный портрет и два простых образа друида загружены');
  const forestArt = await page.evaluate(async () => {
    const { ENVIRONMENT_VARIANTS } = await import('/src/data/environment.ts');
    const game = window.__smokeGame;
    const variants = ENVIRONMENT_VARIANTS.tree;
    const preserved = await Promise.all(variants.map(async art => {
      const image = new Image(); image.src = art.id === 'pine-dark-green'
        ? '/docs/art/pine-preview-v1/pine-dark-green.png'
        : art.id === 'broadleaf' ? '/docs/art/broadleaf-tree-v1/broadleaf.png'
        : `/docs/art/conifer-trees-v1/sprites/${art.id}.png`; await image.decode();
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
  ok(forestArt.count === 6 && forestArt.preserved, 'Сосна, новое лиственное и четыре архивных дерева совпадают с PNG; фильтр NEAREST');
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
  ok(slots.preview === 'druid-camp' && slots.background === 'selection-camp-unified' && slots.seatedCharacterId === slots.id,
    'На бревне сидит пиксельная версия выбранного друида');
  ok(slots.seatedWidth === 435 && slots.seatedHeight === 540 && slots.seatedX === 525 && slots.seatedY === 50 &&
    slots.seatedPixelScale === 0.625,
    'Отдельная сидящая фигура сохраняет координаты и масштаб лагеря, за пределами панели кнопок');
  const campPixels = await page.evaluate(async () => {
    const canvas = window.__smokeGame.textures.get('druid-camp').getSourceImage();
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    // Phaser загружает текстуры через blob URL; эталон читаем независимо по выбранному пути.
    const source = new Image();
    source.src = '/docs/art/druid-basic-seated-v1/druid-seated.png';
    await source.decode();
    const reference = document.createElement('canvas');
    reference.width = 696; reference.height = 864;
    const context = reference.getContext('2d');
    context.drawImage(source, 0, 0);
    const approvedPixels = context.getImageData(0, 0, 696, 864).data;
    let transparent = 0; for (let i = 3; i < data.length; i += 4) if (!data[i]) transparent++;
    const scene = window.__smokeGame.scene.getScene('CharacterSelect');
    const staff = scene.children.getByName('selected-character-prop-0');
    return { width: canvas.width, height: canvas.height, transparent: transparent / (canvas.width * canvas.height),
      separate: scene.children.getByName('camp-background')?.texture.key === 'selection-camp-unified' && staff?.texture.key === 'druid-camp-staff' &&
        staff.getData('characterId') === 'druid' && staff.depth < scene.children.getByName('selected-character-preview').depth,
      identical: data.length === approvedPixels.length && data.every((value, index) => value === approvedPixels[index]) };
  });
  ok(campPixels.width === 696 && campPixels.height === 864 && campPixels.identical && campPixels.transparent > .65 && campPixels.separate,
    `Basic 04 сидит отдельным прозрачным слоем; фон и лежащий посох отдельны (${JSON.stringify(campPixels)})`);
  const campLayers = await page.evaluate(async () => {
    const game = window.__smokeGame;
    const canvas = document.createElement('canvas'); canvas.width = 696; canvas.height = 864;
    const context = canvas.getContext('2d');
    const read = image => { context.clearRect(0, 0, 696, 864); context.drawImage(image, 0, 0); return context.getImageData(0, 0, 696, 864).data; };
    const reference = new Image(); reference.src = '/docs/art/druid-basic-seated-v1/camp-reference.png'; await reference.decode();
    const maskImage = new Image(); maskImage.src = '/docs/art/druid-basic-seated-v1/camp-edit-mask.png'; await maskImage.decode();
    const old = read(reference), mask = read(maskImage), plate = read(game.textures.get('selection-camp-plate').getSourceImage());
    const body = read(game.textures.get('druid-camp').getSourceImage()), staff = read(game.textures.get('druid-camp-staff').getSourceImage());
    let sameOutside = true, disjoint = true, outside = 0, staffPixels = 0;
    for (let p = 0; p < mask.length; p += 4) {
      if (!mask[p]) {
        outside++;
        for (let channel = 0; channel < 4; channel++) sameOutside &&= old[p + channel] === plate[p + channel];
      }
      if (body[p + 3] && staff[p + 3]) disjoint = false;
      if (staff[p + 3]) staffPixels++;
    }
    return sameOutside && outside > 300000 && disjoint && staffPixels > 1000 &&
      game.textures.get('druid-camp-staff').source[0].scaleMode === 1;
  });
  ok(campLayers, 'Фон за пределами старой фигуры/посоха сохранён; новая фигура и лежащий посох независимы и не пересекаются');
  ok(await page.evaluate(() => {
    const scene=window.__smokeGame.scene.getScene('CharacterSelect');
    const prop=scene.children.getByName('selected-character-prop-0');
    const image=prop.texture.getSourceImage();
    const canvas=document.createElement('canvas'); canvas.width=696; canvas.height=864;
    const context=canvas.getContext('2d');
    context.translate((prop.x-525)/.625,(prop.y-50)/.625);
    context.rotate(prop.rotation); context.scale(prop.scaleX/.625,prop.scaleY/.625);
    context.drawImage(image,-prop.displayOriginX,-prop.displayOriginY);
    const data=context.getImageData(0,0,696,864).data;
    let minX=696,minY=864,maxX=0,maxY=0,logContact=false;
    for(let y=0;y<864;y++) for(let x=0;x<696;x++) if(data[(y*696+x)*4+3]) {
      minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y);
      if(x>=575 && x<=640 && y>=550 && y<=610) logContact=true;
    }
    context.setTransform(1,0,0,1,0,0); context.clearRect(0,0,696,864);
    context.drawImage(window.__smokeGame.textures.get('druid-camp').getSourceImage(),0,0);
    const body=context.getImageData(0,0,696,864).data;
    const disjoint=data.every((v,i)=>i%4!==3 || !v || !body[i]);
    return minX>540 && minX<580 && minY>280 && minY<340 && maxY>680 && maxY<725 && maxX<696 &&
      maxY-minY>2*(maxX-minX) && Math.abs(prop.angle+60)<1e-6 && logContact && disjoint;
  }), 'Прежний посох стоит справа как в главном меню, полностью в кадре и без пересечения с плащом');
  ok(slots.portrait === 'druid-basic-detail', 'Ячейка доступного персонажа использует утверждённый Basic 04');
  const basicPortrait = await page.evaluate(async () => {
    const scene = window.__smokeGame.scene.getScene('CharacterSelect');
    const portrait = scene.children.getByName('character-druid').getByName('portrait-druid');
    const texture = portrait.texture, frame = portrait.frame;
    const original = new Image(); original.src = '/docs/art/druid-sprites-v1/druid-04-basic.png';
    await original.decode();
    const canvas = document.createElement('canvas'); canvas.width = frame.cutWidth; canvas.height = frame.cutHeight;
    const context = canvas.getContext('2d');
    context.drawImage(original, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
      0, 0, frame.cutWidth, frame.cutHeight);
    const expected = context.getImageData(0, 0, canvas.width, canvas.height).data;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(texture.getSourceImage(), frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
      0, 0, frame.cutWidth, frame.cutHeight);
    const actual = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return { identical: expected.every((value, index) => value === actual[index]),
      height: portrait.displayHeight, filter: texture.source[0].scaleMode };
  });
  ok(basicPortrait.identical && basicPortrait.height === 94 && basicPortrait.filter === 1,
    'Портрет Basic 04 копирует утверждённые пиксели и помещается в карточку без перекраски');
  ok(slots.pixels.width === 960 && slots.pixels.height === 540, 'Окружение выбора — единый пиксельный фон 960×540, без непрозрачной половины поверх него');
  await testCampAtmosphere(page, ok, clickNamed, waitScene);
  await testMenuWindow(page, ok, clickNamed, waitScene);
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
      camp: { ...CHARACTERS[0].camp, props: [], texture: '_test-camp-variant', scale: 2, position: { x: 806, y: 400 } },
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
  ok(await page.evaluate(() => !window.__smokeGame.scene.getScene('CharacterSelect').children.getByName('selected-character-prop-0')),
    'Выбор персонажа без посоха удаляет прежний слой экипировки');
  await clickNamed('CharacterSelect', 'start-run');
  await waitScene('Room');
  ok(await page.evaluate(() => {
    const scene = window.__smokeGame.scene.getScene('Room');
    return scene.characterId === 'locked-1' && scene.player.texture.key === '_test-game-variant' &&
      scene.player.displayWidth === 48 && scene.player.displayHeight === 60 &&
      scene.player.body.width === 20 && scene.player.body.height === 25;
  }), 'Игровая комната использует спрайт и масштаб выбранного персонажа из его данных');
  await page.keyboard.press('Escape');
  await waitScene('MainMenu');
  await clickNamed('MainMenu', 'play');
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

  const seededPlayer = await page.evaluateHandle(() => {
    const scene = window.__smokeGame.scene.getScene('Room'), previous = scene.player;
    scene.scene.restart({ characterId: 'druid', seed: 0 }); return previous;
  });
  await page.waitForFunction(previous => {
    const scene = window.__smokeGame.scene.getScene('Room');
    return scene.player !== previous && scene.world.mice.length === 5;
  }, seededPlayer);
  await seededPlayer.dispose();
  await waitScene('Room');

  await testFallenLogs(page,ok);
  await testMushroomInteraction(page,ok,clickNamed,waitScene);
  const mouseArt = await page.evaluate(async () => {
    const { MOUSE } = await import('/src/data/mouse.ts');
    const { MouseWander, mouseCanStand } = await import('/src/behavior/MouseWander.ts');
    const { generateMeadow } = await import('/src/world/meadowLayout.ts');
    const { generateMousePopulation } = await import('/src/world/mousePopulation.ts');
    const scene = window.__smokeGame.scene.getScene('Room'), mouse = scene.world.mice[0];
    window.__mouseObservation = { states: [], moving: false, stopped: true, matching: true, clear: true };
    const observe = () => {
      const data = window.__mouseObservation, state = mouse.behavior.state;
      if (data.states.at(-1) !== state) data.states.push(state);
      const speed = mouse.body.velocity.length();
      if (state === 'run' && speed > 1) data.moving = true;
      if (state !== 'run' && speed > .01) data.stopped = false;
      data.matching &&= mouse.anims.currentAnim?.key === `mouse-${state}`;
      data.clear &&= !scene.world.obstacles.getChildren().some(tree => PhaserRectOverlap(mouse.body, tree.body));
    };
    const PhaserRectOverlap = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
    scene.events.on('postupdate', observe);
    scene.events.once('shutdown', () => scene.events.off('postupdate', observe));
    let alpha = true, nearest = true;
    const unique = [];
    for (const key of ['mouse-look', 'mouse-run', 'mouse-rise']) {
      const texture = scene.textures.get(key), source = texture.getSourceImage();
      const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(source, 0, 0);
      const pixels = ctx.getImageData(0, 0, source.width, source.height).data;
      alpha &&= pixels.some((value, i) => i % 4 === 3 && value === 0) &&
        pixels.every((value, i) => i % 4 !== 3 || value === 0 || value === 255);
      nearest &&= texture.source[0].scaleMode === 1;
      const hashes = new Set();
      for (let i = 0; i < source.width / 32; i++) hashes.add(Array.from(ctx.getImageData(i * 32, 0, 32, 32).data).join());
      unique.push(hashes.size);
    }
    const look = scene.anims.get('mouse-look');
    const durations = look.frames.map(frame => look.msPerFrame + frame.duration);
    let layoutsSafe = true, pathsSafe = true, repeatable = true, seenCycles = true;
    for (let seed = 0; seed < 100; seed++) {
      const layout = generateMeadow(seed), start = generateMousePopulation(layout)[0] ?? layout.spawn, again = generateMousePopulation(layout)[0] ?? layout.spawn;
      layoutsSafe &&= mouseCanStand(layout, start);
      repeatable &&= start.x === again.x && start.y === again.y;
      if (seed >= 20) continue;
      const brain = new MouseWander(layout, start), twin = new MouseWander(layout, start);
      const position = { ...start }, other = { ...start }, states = new Set();
      for (let tick = 0; tick < 1000; tick++) {
        const v = brain.step(20, position), w = twin.step(20, other); states.add(brain.state);
        repeatable &&= v.x === w.x && v.y === w.y && brain.state === twin.state;
        position.x += v.x * .02; position.y += v.y * .02; other.x += w.x * .02; other.y += w.y * .02;
        pathsSafe &&= mouseCanStand(layout, position, 0);
      }
      seenCycles &&= states.size === 4;
    }
    return { alpha, nearest, unique, durations, layoutsSafe, pathsSafe, repeatable, seenCycles,
      body: Math.abs(mouse.body.width - MOUSE.bodyWidth) < .001 && Math.abs(mouse.body.height - MOUSE.bodyHeight) < .001,
      scale: mouse.scale === MOUSE.scale, hudIgnored: !!(mouse.cameraFilter & scene.cameras.getCamera('hud').id) };
  });
  ok(mouseArt.alpha && mouseArt.nearest && mouseArt.unique[1] === 4 && mouseArt.unique[2] === 4,
    'Мышь: прозрачные спрайты без шахматного фона, четыре разные фазы бега и подъёма, NEAREST');
  ok(mouseArt.durations.join() === '1000,100,1000,100,1000,100,1000,100,1000' && mouseArt.body && mouseArt.scale && mouseArt.hudIgnored,
    'Мышь сохраняет темп исходной GIF (5,4 с), масштаб 1,25 и уменьшенное тело; рисуется только камерой мира');
  ok(mouseArt.layoutsSafe && mouseArt.pathsSafe && mouseArt.repeatable && mouseArt.seenCycles,
    '100 seed: свободный старт; 20 симуляций по 20 с: безопасные пути, воспроизводимость и полный мирный цикл');

  const population = await page.evaluate(async () => {
    const { generateMousePopulation } = await import('/src/world/mousePopulation.ts');
    const { generateMeadow } = await import('/src/world/meadowLayout.ts');
    const { MouseWander, mouseCanStand } = await import('/src/behavior/MouseWander.ts');
    const counts = new Set(), regions = new Set();
    let safe = true, repeatable = true, clustered = false, awayFromStart = false, total = 0;
    for (let seed = 0; seed < 1000; seed++) {
      const layout = generateMeadow(seed), points = generateMousePopulation(layout);
      counts.add(points.length); total += points.length;
      repeatable &&= JSON.stringify(points) === JSON.stringify(generateMousePopulation(layout));
      const cells = new Map();
      for (const point of points) {
        safe &&= mouseCanStand(layout, point);
        awayFromStart ||= Math.hypot(point.x - layout.spawn.x, point.y - layout.spawn.y) > 1000;
        const cell = Math.floor(point.x / (layout.width / 3)) + 3 * Math.floor(point.y / (layout.height / 3));
        regions.add(cell); cells.set(cell, (cells.get(cell) ?? 0) + 1);
      }
      clustered ||= [...cells.values()].some(n => n >= 3);
    }
    const layout = generateMeadow(0), start = generateMousePopulation(layout)[0];
    const a = new MouseWander(layout, start, 1), b = new MouseWander(layout, start, 2);
    const before = JSON.stringify(b);
    a.step(100, start);
    const independent = a.target.x !== b.target.x && JSON.stringify(b) === before;
    const scene = window.__smokeGame.scene.getScene('Room');
    const height = (key, x, width, height) => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(scene.textures.get(key).getSourceImage(), x, 0, width, height, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height).data; let top = height, bottom = -1;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) {
        const y = Math.floor(i / 4 / width); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      return bottom - top + 1;
    };
    const ratio = height('mouse-look', 0, 32, 32) * scene.world.mice[0].scaleY /
      (height('druid-game-source', 0, 256, 320) * scene.player.scaleY);
    return { counts: [...counts].sort((a,b) => a-b), safe, repeatable, clustered, awayFromStart,
      regions: regions.size, mean: total / 1000, independent, ratio,
      liveIndependent: new Set(scene.world.mice.map(mouse => mouse.behavior)).size === scene.world.mice.length,
      hudIgnored: scene.world.mice.every(mouse => mouse.cameraFilter & scene.cameras.getCamera('hud').id) };
  });
  ok(population.counts.join() === '0,1,2,3,4,5,6,7,8,9' && population.safe && population.repeatable,
    '1000 seed: численность 0–9, безопасное размещение по всему миру и воспроизводимость');
  ok(population.clustered && population.awayFromStart && population.regions === 9 && population.mean > 4 && population.mean < 5,
    'Нет сетки или квоты: бывают три мыши рядом и пустые участки, покрывается весь мир');
  ok(population.independent && population.liveIndependent && population.hudIgnored,
    'У каждой мыши своё поведение, таймер и генератор; HUD не рисует мышей');
  ok(population.ratio > .23 && population.ratio < .27,
    `Мышь на задних лапках — около четверти видимой высоты друида (${population.ratio.toFixed(3)})`);

  const floorGeneration = await page.evaluate(async () => {
    const { generateForestFloor } = await import('/src/world/forestFloor.ts');
    const { forestFloorSamples } = await import('/src/rendering/forestFloor.ts');
    const game = window.__smokeGame, scene = game.scene.getScene('Room');
    const sample = forestFloorSamples(scene);
    const sourceImage = new Image();
    sourceImage.src = '/docs/art/upright-grass-preview-v1/grass-previous-reference.png';
    await sourceImage.decode();
    const loadedImage = game.textures.get('forest-floor-source').getSourceImage();
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = sourceImage.width; sourceCanvas.height = sourceImage.height;
    const sourceContext = sourceCanvas.getContext('2d');
    sourceContext.drawImage(sourceImage, 0, 0);
    const expectedSource = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;
    sourceContext.drawImage(loadedImage, 0, 0);
    const actualSource = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;
    const approvedSource = loadedImage.width === sourceImage.width && loadedImage.height === sourceImage.height &&
      actualSource.every((value, i) => value === expectedSource[i]);
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
    for (const item of sample) for (let i = 0; i < item.pixels.length; i += 4) palette.add(color(item.pixels, i));
    let originalColors = true, opaque = true;
    for (let i = 0; i < a.pixels.length; i += 4) {
      originalColors &&= palette.has(color(a.pixels, i));
      opaque &&= a.pixels[i + 3] === 255;
    }
    const uniform = new Uint8ClampedArray(128 * 128 * 4);
    for (let i = 0; i < uniform.length; i += 4) uniform.set([37, 59, 41, 255], i);
    const solid = generateForestFloor({ width: 128, height: 128, pixels: uniform }, 257, 193, 55);
    const uniformCovered = solid.pixels.every((value, i) => value === [37, 59, 41, 255][i % 4]);
    // Asymmetric coordinate ramp detects rotations and mirrors, independently of the art.
    const ramp = new Uint8ClampedArray(128 * 128 * 4);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) ramp.set([x, y, 0, 255], (y * 128 + x) * 4);
    let upright = true;
    for (let seed = 0; seed < 16; seed++) {
      const crop = generateForestFloor({ width: 128, height: 128, pixels: ramp }, 96, 96, seed).pixels;
      for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
        const i = (y * 96 + x) * 4;
        upright &&= crop[i] === crop[0] + x && crop[i + 1] === crop[1] + y;
      }
    }
    const hashes = new Set();
    for (let seed = 0; seed < 8; seed++) hashes.add(fingerprint(generateForestFloor(sample, 241, 193, seed).pixels));
    const floor = scene.children.getByName('forest-floor');
    const canvas = floor.texture.getSourceImage();
    const actual = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let covered = true;
    for (let i = 0; i < actual.length; i += 4) {
      if (actual[i + 3] !== 255) covered = false;
    }
    return { repeatable: a.pixels.every((value, i) => value === b.pixels[i]),
      different: fingerprint(a.pixels) !== fingerprint(c.pixels) && hashes.size === 8,
      originalColors, opaque, uniformCovered, covered, approvedSource, upright,
      source: floor.getData('sourceTexture'), seed: floor.getData('seed'), layoutSeed: scene.layout.seed,
      width: canvas.width, height: canvas.height, displayWidth: floor.displayWidth, displayHeight: floor.displayHeight,
      patches: floor.getData('patchCount'), nearest: floor.texture.source[0].scaleMode === 1,
      sourceCounts: floor.getData('sourceCounts'), weights: sample.map(item => item.weight),
      noStamp: !game.textures.exists('_forest-floor-stamp') };
  });
  ok(floorGeneration.repeatable && floorGeneration.different,
    'Подстилка воспроизводится по seed; разные seed дают разные рисунки');
  ok(floorGeneration.originalColors && floorGeneration.opaque && floorGeneration.uniformCovered,
    'Стыки сохраняют исходные цвета и непрозрачность, включая углы и неполные крайние фрагменты');
  ok(floorGeneration.source === 'forest-floor-source' && floorGeneration.seed === floorGeneration.layoutSeed &&
    floorGeneration.width === 3072 && floorGeneration.height === 1728 && floorGeneration.displayWidth === 3840 &&
    floorGeneration.displayHeight === 2160 && floorGeneration.patches === 1032 && floorGeneration.nearest && floorGeneration.covered,
    'Подстилка покрывает весь мир: пиксель 1,25 единицы, 1032 фрагмента, NEAREST, без прозрачных швов');
  ok(floorGeneration.noStamp, 'Временная текстура подстилки удалена после отрисовки');
  ok(floorGeneration.approvedSource && floorGeneration.weights.join() === '1' &&
    floorGeneration.sourceCounts.grass === floorGeneration.patches && !floorGeneration.sourceCounts.flowers,
    'Подключён второй утверждённый PNG без изменения пикселей и смешивания с прежней травой');
  ok(floorGeneration.upright, '16 seed сохраняют направление рисунка: без поворотов и отражений травинок');

  const grassCoverage = await page.evaluate(async () => {
    const { generateForestFloor } = await import('/src/world/forestFloor.ts');
    const { sampleGrassForeground } = await import('/src/world/grassCoverage.ts');
    const { forestFloorSamples } = await import('/src/rendering/forestFloor.ts');
    const scene = window.__smokeGame.scene.getScene('Room');
    const source = forestFloorSamples(scene)[0], onePixel = new Uint8ClampedArray(4);
    const clearPoints = [[50, 40], [55, 40], [155, 118], [166, 142], [100, 160]];
    const gapsClear = clearPoints.every(([x, y]) => sampleGrassForeground(source, x + .5, y, onePixel, 1, 1).covered === 0);
    const bladesKept = [[40, 40], [45, 50], [119, 35], [70, 130]].every(([x, y]) =>
      sampleGrassForeground(source, x + .5, y, onePixel, 1, 1).covered === 1 && onePixel[3] === 255);
    const pixels = new Uint8ClampedArray(128 * 128 * 4), heights = new Uint8Array(128 * 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      pixels.set([x, y, 43, 255], (y * 128 + x) * 4);
      heights[y * 128 + x] = 1 + (x + y) % 40;
    }
    const raster = generateForestFloor({ width: 128, height: 128, pixels, grassHeights: heights }, 320, 241, 57);
    const matched = raster.grassHeights.every((height, i) => height === 1 + (raster.pixels[i * 4] + raster.pixels[i * 4 + 1]) % 40);
    const fixture = { width: 16, height: 16, pixels: new Uint8ClampedArray(16 * 16 * 4), grassHeights: new Uint8Array(16 * 16) };
    fixture.pixels.set([20, 70, 31, 255], (6 * 16 + 7) * 4);
    fixture.grassHeights[6 * 16 + 7] = 5; // blade rooted at y=11
    const target = new Uint8ClampedArray(8 * 7 * 4);
    const behind = sampleGrassForeground(fixture, 8, 8, target, 8, 7);
    const behindVisible = behind.covered === 1 && target.some((value, i) => i % 4 === 3 && value === 255);
    const inFront = sampleGrassForeground(fixture, 8, 11, target, 8, 7);
    const inFrontClear = inFront.covered === 0 && target.every(value => value === 0);
    let edgesSafe = true;
    for (const x of [-3, 0, 16, 19]) for (const y of [-3, 0, 16, 19]) {
      sampleGrassForeground(fixture, x, y, target, 8, 7);
      edgesSafe &&= target.every(value => value === 0);
    }
    return { matched, behindVisible, inFrontClear, edgesSafe, gapsClear, bladesKept };
  });
  ok(grassCoverage.matched, 'Маска травы следует тем же вырезкам и неровным стыкам, что цвета подстилки');
  ok(grassCoverage.behindVisible && grassCoverage.inFrontClear && grassCoverage.edgesSafe,
    'Трава перекрывает ноги за своим основанием, пропускает их перед ним и безопасна у границ мира');
  ok(grassCoverage.gapsClear && grassCoverage.bladesKept,
    'Маска выбранного PNG сохраняет отдельные травинки, а просветы между ними и ровный покров не перекрывают обувь');

  const grassRendering = await page.evaluate(async () => {
    const game = window.__smokeGame, scene = game.scene.getScene('Room');
    const { GRASS_COVERAGE } = await import('/src/world/grassCoverage.ts');
    const overlay = scene.children.getByName('grass-foreground');
    const texture = overlay.texture, canvas = texture.getSourceImage();
    const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const read = () => game.canvas.getContext('2d').getImageData(0, 0, game.canvas.width, game.canvas.height).data;
    const old = { x: scene.player.x, y: scene.player.y, depth: scene.player.depth };
    scene.scene.pause();
    let best = { count: 0, x: old.x, y: old.y }, clear;
    let changedAllDirections = true, bootsOnly = true, sameFloorPixels = true;
    for (let y = old.y - 100; y <= old.y + 100; y += 5) for (let x = old.x - 100; x <= old.x + 100; x += 5) {
      scene.world.updateGrass(x, y + 22.5, y + 25);
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let py = 0; py < canvas.height; py++) for (let px = 12; px < canvas.width - 12; px++) {
        if (data[(py * canvas.width + px) * 4 + 3]) count++;
      }
      if (count > best.count) best = { count, x, y };
      if (!overlay.visible) clear = { x, y };
    }
    if (!best.count || !clear) throw new Error('Не найдены пучок и ровный покров возле старта для проверки перекрытия');
    scene.player.setPosition(clear.x, clear.y).setDepth(clear.y + 25);
    scene.world.updateGrass(clear.x, clear.y + 22.5, clear.y + 25);
    await frames(); const clearBefore = read();
    overlay.setVisible(true); await frames(); const clearAfter = read();
    const flatUnchanged = clearAfter.every((value, i) => value === clearBefore[i]);
    scene.player.setPosition(best.x, best.y).setDepth(best.y + 25);
    scene.world.updateGrass(best.x, best.y + 22.5, best.y + 25);
    const floor = scene.children.getByName('forest-floor').texture.getSourceImage();
    const mask = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = floor.getContext('2d').getImageData(overlay.x / 1.25, overlay.y / 1.25, canvas.width, canvas.height).data;
    for (let i = 0; i < mask.length; i += 4) if (mask[i + 3]) {
      for (let c = 0; c < 4; c++) sameFloorPixels &&= mask[i + c] === colors[i + c];
    }
    for (const direction of ['down', 'up', 'left', 'right', 'down-left', 'down-right', 'up-left', 'up-right']) {
      scene.player.setTexture('druid-game', direction);
      overlay.setVisible(false); await frames(); const before = read();
      overlay.setVisible(true); await frames(); const after = read();
      const camera = scene.cameras.main;
      const feet = (scene.player.y + 22.5 - camera.worldView.y) * camera.zoom;
      let changed = 0;
      for (let i = 0; i < after.length; i += 4) {
        if (after[i] === before[i] && after[i + 1] === before[i + 1] && after[i + 2] === before[i + 2]) continue;
        changed++;
        const y = Math.floor(i / 4 / game.canvas.width);
        bootsOnly &&= y >= feet - GRASS_COVERAGE.immersion * camera.zoom - 2 && y <= feet + 2;
      }
      changedAllDirections &&= changed > 0;
    }
    const frozen = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    await frames();
    const staticPixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.every((value, i) => value === frozen[i]);
    const result = { changedAllDirections, bootsOnly, sameFloorPixels, staticPixels, flatUnchanged,
      small: canvas.width * canvas.height < 512, nearest: texture.source[0].scaleMode === 1,
      depth: overlay.depth > scene.player.depth, noBody: !overlay.body };
    scene.player.setPosition(old.x, old.y).setDepth(old.depth).setTexture('druid-game', 'down');
    scene.scene.resume(); await frames();
    return result;
  });
  ok(grassRendering.changedAllDirections && grassRendering.bootsOnly,
    'Во всех восьми ракурсах трава действительно перекрывает только низ обуви на игровом холсте');
  ok(grassRendering.flatUnchanged, 'На ровном покрове передний слой полностью прозрачен и не меняет изображение друида');
  ok(grassRendering.sameFloorPixels && grassRendering.staticPixels && grassRendering.nearest,
    'Передние травинки сохраняют цвета и позиции подстилки, остаются неподвижными и без сглаживания');
  ok(grassRendering.small && grassRendering.depth && grassRendering.noBody,
    'Для перекрытия используется одна текстура меньше 512 пикселей, поверх героя, без физического тела');

  const state = () => page.evaluate(async () => {
    const { obstacleRect, obstacleVisualRect } = await import('/src/world/meadowLayout.ts');
    const { environmentVariant } = await import('/src/data/environment.ts');
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
      expectedTextures: scene.layout.obstacles.map(object => environmentVariant(object.kind, object.variant).texture),
      obstacles: scene.world.obstacles.getChildren().map(object => ({ kind: object.getData('kind'), ...rect(object.body),
        texture: object.texture.key, frame: object.frame.name, imageBounds: { x: object.getBounds().x, y: object.getBounds().y,
          width: object.displayWidth, height: object.displayHeight } })),
      colliders: scene.physics.world.colliders.getActive().length, wolfCount: scene.world.wolves.length,
      mouseCount: scene.children.list.filter(object => object.name === 'wandering-mouse').length,
      view: { x: view.x, y: view.y, width: view.width, height: view.height },
      hudView: { x: scene.hudCamera.worldView.x, y: scene.hudCamera.worldView.y, zoom: scene.hudCamera.zoom,
        width: scene.hudCamera.width, height: scene.hudCamera.height },
      cameraCount: scene.cameras.cameras.length,
      cameraCenter: { x: scene.cameras.main.midPoint.x, y: scene.cameras.main.midPoint.y },
      canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
      viewport: { width: innerWidth, height: innerHeight },
      combat: !!scene.enemy || !!scene.projectiles, acornEnabled: !!scene.acorns,
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
    await isolateWolf();
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
    ok(current.obstacles.filter(body=>body.kind==='tree').every((body, i) => {
      const object = layout.obstacles[i], expected = current.expectedBodies[i], image = current.expectedImages[i];
      return body.kind === object.kind && body.width === expected.width && body.height === expected.height &&
        Math.abs(body.x - expected.x) < 0.1 && Math.abs(body.y - expected.y) < 0.1 &&
        Math.abs(body.imageBounds.x - image.x) < 0.1 && Math.abs(body.imageBounds.y - image.y) < 0.1 &&
        body.imageBounds.width === image.width && body.imageBounds.height === image.height &&
        body.texture === current.expectedTextures[i];
    }), 'Спрайты из каталога имеют правильный масштаб, точку опоры и физическое основание');
    ok(!current.obstacles.some(body => intersects(current.body, body)), 'Друид появляется в свободном месте');
    ok(current.colliders === current.mouseCount + 1 + current.wolfCount * 2 && current.mouseCount >= 0 && current.mouseCount <= 9,
      `0–9 мышей; деревья и столкновения всех волков: ${current.mouseCount}, ${current.colliders}`);
  };

  const generation = await page.evaluate(async () => {
    const { generateMeadow, obstacleRect, obstacleVisualRect, overlaps } = await import('/src/world/meadowLayout.ts');
    const { ENVIRONMENT_VARIANTS, TREE_SPAWN_POOL } = await import('/src/data/environment.ts');
    const archivedPool = ENVIRONMENT_VARIANTS.tree.filter(art => !TREE_SPAWN_POOL.includes(art.id)).map(art => art.id);
    let pineCount=0,broadleafCount=0;
    const activeTreesOnly = TREE_SPAWN_POOL.join() === 'pine-dark-green,broadleaf' && Array.from({ length: 200 }, (_, seed) => generateMeadow(seed))
      .every(layout => {
        const ids=layout.obstacles.map(object=>ENVIRONMENT_VARIANTS.tree[object.variant].id);
        pineCount+=ids.filter(id=>id==='pine-dark-green').length;
        broadleafCount+=ids.filter(id=>id==='broadleaf').length;
        return layout.counts.trees >= 70 && layout.counts.trees <= 99 && layout.obstacles.length === layout.counts.trees &&
          ids.every(id=>TREE_SPAWN_POOL.includes(id))&&ids.includes('pine-dark-green')&&ids.includes('broadleaf')&&
          JSON.stringify(layout)===JSON.stringify(generateMeadow(layout.seed))&&
          layout.obstacles.every((object,i)=>{
            const r=obstacleRect(object),v=obstacleVisualRect(object);
            const spawn={x:layout.spawn.x-64,y:layout.spawn.y-58,width:128,height:128};
            return v.x>=0&&v.y>=0&&v.x+v.width<=layout.width&&v.y+v.height<=layout.height&&
              !overlaps(v,spawn)&&!overlaps(r,spawn,16)&&
              layout.obstacles.slice(i+1).every(other=>!overlaps(r,obstacleRect(other),27));
          });
      });
    const emptyPoolSupported = generateMeadow(123, []).obstacles.length === 0;
    const failures = []; const treeCounts = new Set();
    const treeVariants = new Set();
    let interiorTrees = 0; let totalTrees = 0;
    for (let seed = 0; seed < 2000; seed++) {
      const layout = generateMeadow(seed, archivedPool); const { width, height } = layout;
      const trees = layout.obstacles.filter(o => o.kind === 'tree');
      trees.forEach(o => treeVariants.add(o.variant));
      treeCounts.add(trees.length); totalTrees += trees.length;
      interiorTrees += trees.filter(o => o.x > width * 0.25 && o.x < width * 0.75 &&
        o.y > height * 0.25 && o.y < height * 0.75).length;
      const spawn = { x: layout.spawn.x - 10, y: layout.spawn.y - 2.5, width: 20, height: 25 };
      if (width !== 3840 || height !== 2160 || trees.length < 70 || trees.length > 99 ||
        trees.length !== layout.counts.trees ||
        layout.obstacles.length !== trees.length || layout.spawn.x !== width / 2 || layout.spawn.y !== height / 2 ||
        layout.obstacles.some((object, i) => {
          const r = obstacleRect(object), visual = obstacleVisualRect(object);
          return visual.x < 0 || visual.y < 0 || visual.x + visual.width > width || visual.y + visual.height > height || overlaps(visual, spawn) || r.x < 0 || r.y < 0 || r.x + r.width > width || r.y + r.height > height || overlaps(r, spawn) ||
            layout.obstacles.slice(i + 1).some(other => overlaps(r, obstacleRect(other), 27));
        })) failures.push(seed);
    }
    return { failures, activeTreesOnly, pineFraction:pineCount/(pineCount+broadleafCount),emptyPoolSupported, treeVariants: [...treeVariants].sort((a,b) => a-b),
      treeCounts: [...treeCounts].sort((a, b) => a - b),
      interiorFraction: interiorTrees / totalTrees,
      repeatable: JSON.stringify(generateMeadow(123, archivedPool)) === JSON.stringify(generateMeadow(123, archivedPool)),
      different: JSON.stringify(generateMeadow(123, archivedPool).obstacles) !== JSON.stringify(generateMeadow(124, archivedPool).obstacles),
    };
  });
  ok(generation.activeTreesOnly && generation.emptyPoolSupported && generation.pineFraction>.47 && generation.pineFraction<.53, '200 живых планировок: 70–99 деревьев, сосна и лиственное вперемешку с равной вероятностью; безопасные стволы/границы/старт и воспроизводимый seed');
  ok(generation.failures.length === 0, `2000 архивных планировок при явном включении: 70–99 деревьев, безопасный центр и непересекающиеся препятствия (${generation.failures})`);
  ok(generation.treeCounts.join() === Array.from({ length: 30 }, (_, i) => i + 70).join(),
    'Генерация использует все допустимые количества деревьев, включая границы диапазонов');
  ok(generation.interiorFraction > 0.2 && generation.interiorFraction < 0.35,
    'Деревья распределены и внутри локации, без прежнего уплотнения только по краям');
  ok(generation.repeatable && generation.different, 'Одинаковый seed воспроизводит поляну, другой меняет окружение');
  ok(generation.treeVariants.join() === '0,1,2,3',
    'Все четыре архивных вида доступны при явном включении пула');

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
  ok(gameArt.key === 'druid-game' && gameArt.width === 256 && gameArt.height === 320 && gameArt.colors > 256,
    'Друид использует принятый подробный PNG 256×320 без уменьшения сетки и ограничения палитры');
  ok(gameArt.transparent > 32000 && gameArt.opaque > 24000 && gameArt.translucent === 0,
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
    const sources = ['down', 'up', 'left', 'right', 'down-left', 'down-right', 'up-left', 'up-right'].map(direction => ({
      direction, sourceX: 0, width: 256, height: 320,
      path: `/docs/art/${direction === 'left' ? 'druid-left-tunic-v1' : 'druid-eight-way-v1'}/idle-${direction}-256x320.png`,
    }));
    return Promise.all(sources.map(async ({ direction, sourceX, width, height, path }) => {
      const image = new Image(); image.src = path; await image.decode();
      const reference = document.createElement('canvas'); reference.width = 256; reference.height = 320;
      const context = reference.getContext('2d'); context.imageSmoothingEnabled = false;
      context.drawImage(image, sourceX, 0, width, height, 0, 0, 256, 320);
      const expected = context.getImageData(0, 0, 256, 320).data;
      const frame = texture.get(direction);
      const actual = atlas.getImageData(frame.cutX, frame.cutY, 256, 320).data;
      const preserved = expected.length === actual.length && actual.every((value, index) => value === expected[index]);
      let signature = 2166136261;
      let lastY = -1;
      for (let i = 0; i < actual.length; i++) signature = Math.imul(signature ^ actual[i], 16777619);
      for (let i = 3; i < actual.length; i += 4) if (actual[i]) lastY = Math.floor(i / 4 / 256);
      return { direction, preserved, width: frame.width, height: frame.height, signature, feetY: lastY + 1 };
    }));
  });
  ok(directionalArt.length === 8 && directionalArt.every(view => view.preserved && view.width === 256 && view.height === 320),
    'Все восемь неподвижных ракурсов совпадают с отдельными подробными PNG 1:1');
  ok(new Set(directionalArt.map(view => view.signature)).size === 8 && directionalArt.every(view => view.feetY === 300),
    'Ракурсы различаются; все восемь фигур имеют общую опору ног на строке 300');
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
  await hold('d', 400);
  const insideCamera = await state();
  ok(insideCamera.x > beforeCamera.x + 40 && insideCamera.x < beforeCamera.x + 80 &&
    Math.abs(insideCamera.view.x - beforeCamera.view.x) < 0.01 && Math.abs(insideCamera.view.y - beforeCamera.view.y) < 0.01,
    'Друид свободно движется внутри овала, камера остаётся на месте');
  await page.keyboard.down('d'); await delay(1700);
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
    const image = new Image(); image.src = '/docs/art/druid-eight-way-v1/walk-down-256x320.png'; await image.decode();
    const read = source => {
      const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 320;
      const context = canvas.getContext('2d'); context.drawImage(source, 0, 0);
      return context.getImageData(0, 0, 1024, 320).data;
    };
    const expected = read(image);
    return ['druid-walk-down-source', 'druid-walk-down-source-runtime'].every(key => {
      const texture = window.__smokeGame.textures.get(key);
      const actual = read(texture.getSourceImage());
      return texture.source[0].scaleMode === 1 && actual.every((value, index) => value === expected[index]);
    });
  });
  ok(walkPixels, 'Все четыре подробных кадра ходьбы вниз совпадают с принятым PNG в исходной и игровой текстурах');

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
    while (performance.now() - startTime < 1180) {
      if (frames.at(-1) !== p.frame.name) frames.push(p.frame.name);
      geometryPreserved &&= p.width === 256 && p.height === 320 && p.body.width === 20 && p.body.height === 25 &&
        Math.abs(p.displayWidth - 87.5) < 0.01 && Math.abs(p.displayHeight - 109.375) < 0.01 &&
        Math.abs((300 - p.displayOriginY) * p.scaleY - 22.5) < 0.01;
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
    const image = new Image(); image.src = '/docs/art/druid-eight-way-v1/walk-up-256x320.png'; await image.decode();
    const read = source => {
      const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 320;
      const context = canvas.getContext('2d'); context.drawImage(source, 0, 0);
      return context.getImageData(0, 0, 1024, 320).data;
    };
    const expected = read(image);
    return ['druid-walk-up-source', 'druid-walk-up-source-runtime'].every(key => {
      const texture = window.__smokeGame.textures.get(key);
      const actual = read(texture.getSourceImage());
      return texture.source[0].scaleMode === 1 && actual.every((value, index) => value === expected[index]);
    });
  });
  ok(upWalkPixels, 'Все четыре подробных кадра ходьбы вверх совпадают с принятой полосой в исходной и игровой текстурах');
  const upCorridor = await page.evaluate(() => {
    const scene = window.__smokeGame.scene.getScene('Room');
    const obstacles = scene.world.obstacles.getChildren().map(object => object.body);
    for (let y = 250; y < scene.layout.height - 30; y += 20) {
      for (let x = 30; x < scene.layout.width - 30; x += 20) {
        const corridor = { x: x - 10, y: y - 230, right: x + 10, bottom: y + 12.5 };
        if (obstacles.some(o => corridor.x < o.right && corridor.right > o.x && corridor.y < o.bottom && corridor.bottom > o.y)) continue;
        scene.player.body.reset(x, y - 10);
        return { x, y: y - 10 };
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
    while (performance.now() - startTime < 1180) {
      if (frames.at(-1) !== p.frame.name) frames.push(p.frame.name);
      geometryPreserved &&= p.width === 256 && p.height === 320 && p.body.width === 20 && p.body.height === 25 &&
        Math.abs(p.displayWidth - 87.5) < 0.01 && Math.abs(p.displayHeight - 109.375) < 0.01 &&
        Math.abs((300 - p.displayOriginY) * p.scaleY - 22.5) < 0.01;
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
  const rightDuringWalk = await waitState(current => current.facing === 'up-right' && current.animationKey === 'druid-walk-up-right' && current.animationPlaying);
  ok(rightDuringWalk.vx > 0, 'Переход с W на W+D включает отдельный диагональный цикл вверх-вправо');
  await page.keyboard.up('d');
  await waitState(current => current.animationPlaying && current.animationKey === 'druid-walk-up');
  await page.keyboard.up('w');
  const idleAfterUp = await waitState(current => !current.animationPlaying && current.frame === 'up' && current.vy === 0);
  ok(idleAfterUp.facing === 'up', 'Отпускание W возвращает стоящий вид со спины');

  const plantedUp = await page.evaluate(() => {
    const scene = window.__smokeGame.scene.getScene('Room');
    const player = scene.player;
    const frame = player.frame;
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 320;
    const context = canvas.getContext('2d');
    context.drawImage(player.texture.getSourceImage(), frame.cutX, frame.cutY, 256, 320, 0, 0, 256, 320);
    const standing = context.getImageData(0, 0, 256, 320).data;
    context.clearRect(0, 0, 256, 320);
    context.drawImage(scene.textures.get('druid-walk-up-source').getSourceImage(), 0, 0);
    const walking = context.getImageData(0, 0, 256, 320).data;
    const bootGrounded = (left, right) => {
      for (let y = 280; y < 300; y++) for (let x = left; x < right; x++) if (standing[(y * 256 + x) * 4 + 3]) return true;
      return false;
    };
    return { bothPlanted: bootGrounded(100, 130) && bootGrounded(134, 165),
      differentLegs: standing.some((value, i) => i >= 200 * 256 * 4 && value !== walking[i]),
      sameHood: standing.slice(0, 65 * 256 * 4).every((value, i) => value === walking[i]) };
  });
  ok(plantedUp.bothPlanted && plantedUp.differentLegs && plantedUp.sameHood,
    'После W обе ноги опущены в устойчивую стойку; принятый капюшон сохранён');
  for (let phase = 0; phase < 4; phase++) {
    // Each phase starts in the same clear corridor, away from the world edge.
    await page.evaluate(point => window.__smokeGame.scene.getScene('Room').player.body.reset(point.x, point.y), upCorridor);
    await page.keyboard.down('w');
    await waitState(current => current.frame === `walk-up-${phase}` && current.animationPlaying);
    await page.keyboard.up('w');
    await waitState(current => current.frame === 'up' && !current.animationPlaying && current.vy === 0);
  }
  ok(true, 'Остановка в каждой из четырёх фаз W возвращает отдельную стоящую позу');

  for (const { key, direction, sign, folder } of [
    { key: 'a', direction: 'left', sign: -1, folder: 'druid-left-tunic-v1' },
    { key: 'd', direction: 'right', sign: 1, folder: 'druid-walk-right-v2' },
  ]) {
    const walkPixels = await page.evaluate(async ({ direction, folder }) => {
      const image = new Image(); image.src = `/docs/art/${folder}/walk-${direction}-256x320.png`; await image.decode();
      const texture = window.__smokeGame.textures.get(`druid-walk-${direction}-source`);
      const runtime = window.__smokeGame.textures.get(`druid-walk-${direction}-source-runtime`);
      const read = source => {
        const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 320;
        const context = canvas.getContext('2d'); context.drawImage(source, 0, 0);
        return context.getImageData(0, 0, 1024, 320).data;
      };
      const expected = read(image);
      return [texture, runtime].every(source => read(source.getSourceImage()).every((value, index) => value === expected[index]));
    }, { direction, folder });
    ok(walkPixels, `${direction}: все четыре принятых подробных кадра сохранены 1:1 в исходной и игровой текстурах`);
    const rawBasic = await page.evaluate(direction => {
      const scene = window.__smokeGame.scene.getScene('Room');
      const animation = scene.anims.get(`druid-walk-${direction}`);
      const texture = scene.textures.get(animation.frames[0].textureKey);
      return texture.key === `druid-walk-${direction}-source-runtime` && texture.source[0].scaleMode === 1 &&
        animation.frames.length === 4 && animation.msPerFrame === 160;
    }, direction);
    ok(rawBasic, `${direction}: Basic сохраняется с NEAREST, прежним размером в мире и без перекраски сапог`);
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
      while (performance.now() - startTime < 1180) {
        if (frames.at(-1) !== p.frame.name) frames.push(p.frame.name);
        geometryPreserved &&= p.width === 256 && p.height === 320 && p.body.width === 20 && p.body.height === 25 &&
          Math.abs(p.displayWidth - 87.5) < 0.01 && Math.abs(p.displayHeight - 109.375) < 0.01 &&
          Math.abs((300 - p.displayOriginY) * p.scaleY - 22.5) < 0.01;
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
    if (direction === 'right') {
      await waitState(s => s.frame === 'walk-right-2');
      await page.screenshot({ path: fileURLToPath(new URL('../test-results/basic-walk-right.png', import.meta.url)) });
    }
    await page.keyboard.up(key);
    const idle = await waitState(current => !current.animationPlaying && current.frame === direction && current.vx === 0);
    ok(idle.facing === direction, `Отпускание ${key.toUpperCase()} возвращает стоящий спрайт ${direction}`);
  }

  ok(await page.evaluate(async () => {
    const read = async path => {
      const image = new Image(); image.src = path; await image.decode();
      const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
      const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const updated = await read('/docs/art/druid-walk-right-v2/walk-right-256x320.png');
    const previous = await read('/docs/art/druid-eight-way-v1/walk-right-256x320.png');
    let upperUnchanged = true, connected = true; const toes = [];
    for (let frame = 0; frame < 4; frame++) {
      let toe = 0;
      for (let y = 0; y < 320; y++) for (let x = 0; x < 256; x++) {
        const i = (y * 1024 + frame * 256 + x) * 4;
        if (y < 220) for (let c = 0; c < 4; c++) upperUnchanged &&= updated[i+c] === previous[i+c];
        if (y >= 278 && x < 200 && updated[i+3] === 255) toe = Math.max(toe,x);
      }
      toes.push(toe);
      for(let y=258;y<264;y++)for(let x=76;x<83;x++)connected&&=updated[(y*1024+frame*256+x)*4+3]===255;
      // These trousers belonged to the approved right body and must remain
      // opaque when the opposite leg donor is occluded by its original cloak.
      for(let y=230;y<252;y++) for(let x=78;x<95;x++) {
        const i=(y*1024+frame*256+x)*4;
        if(previous[i+3]===255) connected &&= updated[i+3]===255;
      }
    }
    return upperUnchanged && connected && Math.abs(toes[0]-toes[1]) >= 10 && Math.abs(toes[2]-toes[3]) >= 10;
  }), 'Вправо: ноги проходят разные фазы шага; принятые верх, рука и посох сохранены точно');

  const clearSquare = await page.evaluate(() => {
    const scene = window.__smokeGame.scene.getScene('Room');
    const obstacles = scene.world.obstacles.getChildren().map(o => o.body);
    for (let y = 280; y < scene.layout.height - 280; y += 30) {
      for (let x = 280; x < scene.layout.width - 280; x += 30) {
        if (!obstacles.some(o => x - 250 < o.right && x + 250 > o.x && y - 250 < o.bottom && y + 250 > o.y)) return { x, y };
      }
    }
    return null;
  });
  assert.ok(clearSquare, 'Нет свободного участка для проверки диагональных циклов');
  for (const [direction, keys, sx, sy] of [
    ['down-left', ['s', 'a'], -1, 1], ['down-right', ['s', 'd'], 1, 1],
    ['up-left', ['w', 'a'], -1, -1], ['up-right', ['w', 'd'], 1, -1],
  ]) {
    const frameCount = 4;
    const artFolder = direction.startsWith('up-') ? 'druid-rear-diagonal-walk-v4' : 'druid-diagonal-legs-v3';
    const exactPixels = await page.evaluate(async ({ direction, frameCount, artFolder }) => {
      const image = new Image(); image.src = `/docs/art/${artFolder}/walk-${direction}-256x320.png`; await image.decode();
      const width = frameCount * 256;
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = 320;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      const reference = context.getImageData(0, 0, width, 320).data;
      const exact = ['', '-runtime'].every(suffix => {
        const texture = window.__smokeGame.textures.get(`druid-walk-${direction}-source${suffix}`);
        context.clearRect(0, 0, width, 320); context.drawImage(texture.getSourceImage(), 0, 0);
        return texture.source[0].scaleMode === 1 && texture.getSourceImage().width === width &&
          context.getImageData(0, 0, width, 320).data.every((v, i) => v === reference[i]);
      });
      const original = new Image(); original.src = `/docs/art/druid-eight-way-v1/walk-${direction}-256x320.png`; await original.decode();
      context.clearRect(0, 0, width, 320);
      for (let i = 0; i < frameCount; i++) context.drawImage(original, Math.floor(i * 4 / frameCount) * 256, 0, 256, 320, i * 256, 0, 256, 320);
      const previous = context.getImageData(0, 0, width, 320).data;
      const maskImage = new Image(); maskImage.src = `/docs/art/${artFolder}/protected-${direction}-256x320.png`; await maskImage.decode();
      context.clearRect(0, 0, width, 320); context.drawImage(maskImage, 0, 0);
      const mask = context.getImageData(0, 0, width, 320).data;
      let protectedUnchanged = true, changedPixels = 0, changedHipPixels = 0;
      for (let i = 0; i < reference.length; i += 4) {
        const different = [0, 1, 2, 3].some(c => reference[i + c] !== previous[i + c]);
        if (mask[i + 3]) protectedUnchanged &&= !different;
        if (different) {
          changedPixels++;
          const y = Math.floor(i / 4 / width);
          if (y >= 195 && y < 225) changedHipPixels++;
        }
      }
      const animation = window.__smokeGame.anims.get(`druid-walk-${direction}`);
      return { exact, protectedUnchanged, changedPixels, changedHipPixels,
        cycleMs: animation.msPerFrame * animation.frames.length / (2 / 3),
        frames: animation.frames.length };
    }, { direction, frameCount, artFolder });
    ok(exactPixels.exact, `${direction}: новые ноги загружены из ${frameCount} PNG-кадров 1:1, NEAREST`);
    ok(exactPixels.protectedUnchanged && exactPixels.changedPixels > 500,
      `${direction}: заменены ноги, все защищённые пиксели принятого корпуса и плаща сохранены`);
    ok(exactPixels.frames === frameCount && Math.abs(exactPixels.cycleMs - 960) < .01,
      `${direction}: четыре равномерные фазы сохраняют прежний цикл 960 мс`);
    if (direction.startsWith('down-')) ok(exactPixels.changedHipPixels > 100,
      `${direction}: новый стык проходит под подолом, без прежнего обрезания на y=225`);
    const lowerBody = await page.evaluate(async ({ direction, artFolder }) => {
      async function pixels(path) {
        const image = new Image(); image.src = path; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
        return { data: context.getImageData(0, 0, image.width, image.height).data, width: image.width };
      }
      const [current, previous, mask, oldMask, reference] = await Promise.all([
        pixels(`/docs/art/${artFolder}/legs-${direction}-256x320.png`),
        pixels(`/docs/art/druid-diagonal-legs-v2/legs-${direction}-256x320.png`),
        pixels(`/docs/art/${artFolder}/protected-${direction}-256x320.png`),
        pixels(`/docs/art/druid-diagonal-legs-v2/protected-${direction}-256x320.png`),
        pixels('/docs/art/druid-front-refinement-v2/idle-down-256x320.png'),
      ]);
      const rgb = (d, i) => `${d[i]},${d[i + 1]},${d[i + 2]}`;
      const brown = (d, i) => d[i + 3] && d[i] >= 35 && d[i] > d[i + 1] * 1.15 && d[i + 1] > d[i + 2] * 1.15;
      const luma = (d, i) => .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2];
      const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
      const palette = new Set(), originalTones = [];
      for (let i = 0; i < reference.data.length; i += 4) {
        if (reference.data[i + 3]) palette.add(rgb(reference.data, i));
        const x = i / 4 % 256, y = Math.floor(i / 4 / 256);
        if (y >= 215 && x >= 80 && x < 178 && brown(reference.data, i)) originalTones.push(luma(reference.data, i));
      }
      const tones = [], oldTones = []; let paletteMatches = 0, alphaUnchanged = true;
      for (let i = 0; i < current.data.length; i += 4) {
        alphaUnchanged &&= current.data[i + 3] === previous.data[i + 3];
        if (!mask.data[i + 3] && brown(current.data, i)) {
          tones.push(luma(current.data, i));
          if (palette.has(rgb(current.data, i))) paletteMatches++;
        }
      }
      for (let i = 0; i < previous.data.length; i += 4) {
        if (!oldMask.data[i + 3] && brown(previous.data, i)) oldTones.push(luma(previous.data, i));
      }
      return { alphaUnchanged, paletteFraction: paletteMatches / tones.length,
        median: median(tones), oldMedian: median(oldTones), referenceMedian: median(originalTones) };
    }, { direction, artFolder });
    ok(lowerBody.paletteFraction > .99 && lowerBody.median < lowerBody.oldMedian * .9 &&
      Math.abs(lowerBody.median - lowerBody.referenceMedian) < 5,
      `${direction}: штаны и сапоги используют исходные тёмные RGB; средний тон совпадает со стоящим друидом`);
    if (direction.startsWith('down-')) ok(lowerBody.alphaUnchanged,
      `${direction}: сохранены все силуэты и порядок принятых передних фаз`);
    else {
      const stride = await page.evaluate(async direction => {
        const soles = [];
        for (const role of ['near', 'far']) {
          const image = new Image(); image.src = `/docs/art/druid-rear-diagonal-walk-v4/${role}-leg-${direction}-256x320.png`;
          await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
          const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
          const data = context.getImageData(0, 0, image.width, image.height).data;
          const feet = [];
          for (let frame = 0; frame < 4; frame++) {
            let bottom = -1;
            for (let y = 250; y < 320; y++) for (let x = 0; x < 256; x++) {
              if (data[4 * (y * image.width + frame * 256 + x) + 3]) bottom = y;
            }
            let xSum = 0, count = 0;
            for (let y = bottom - 3; y <= bottom; y++) for (let x = 0; x < 256; x++) {
              if (data[4 * (y * image.width + frame * 256 + x) + 3]) { xSum += x; count++; }
            }
            feet.push({ x: xSum / count, y: bottom });
          }
          soles.push(feet);
        }
        const [near, far] = soles;
        return { firstContact: near[0].y - far[0].y, oppositeContact: far[2].y - near[2].y,
          nearTravel: Math.abs(near[2].x - near[0].x), farTravel: Math.abs(far[2].x - far[0].x),
          nearPassing: near[0].y - near[1].y, farPassing: far[2].y - far[3].y };
      }, direction);
      ok(stride.firstContact >= 10 && stride.oppositeContact >= 8 && stride.nearTravel >= 10 && stride.farTravel >= 10 &&
        stride.nearPassing >= 10 && stride.farPassing >= 10,
        `${direction}: ведущая стопа действительно меняется; обе ноги проходят вперёд/назад и выполняют перенос`);
      if (direction === 'up-right') {
        const seam = await page.evaluate(async () => {
          const values = [];
          for (const folder of ['druid-diagonal-legs-v3', 'druid-rear-diagonal-walk-v4']) {
            const image = new Image(); image.src = `/docs/art/${folder}/walk-up-right-256x320.png`; await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 320;
            const context = canvas.getContext('2d'); context.drawImage(image, 512, 0, 256, 320, 0, 0, 256, 320);
            const data = context.getImageData(0, 0, 256, 320).data;
            let sum = 0, run = 0, longest = 0;
            for (let x = 80; x < 155; x++) {
              const above = 4 * (96 * 256 + x), below = above + 256 * 4;
              const difference = [0, 1, 2].reduce((v, c) => v + Math.abs(data[above + c] - data[below + c]), 0) / 3;
              sum += difference;
              run = difference > 12 && data[above + 3] && data[below + 3] ? run + 1 : 0;
              longest = Math.max(longest, run);
            }
            values.push({ contrast: sum / 75, longest });
          }
          return { previous: values[0], current: values[1] };
        });
        ok(seam.current.contrast < seam.previous.contrast * .5 && seam.current.longest <= 6,
          'Вверх-вправо: устранён горизонтальный срез капюшона на плечах в третьей фазе');
      }
    }
    await page.evaluate(point => window.__smokeGame.scene.getScene('Room').player.body.reset(point.x, point.y), clearSquare);
    for (const key of keys) await page.keyboard.down(key);
    await waitState(s => s.animationPlaying && s.animationKey === `druid-walk-${direction}`);
    const sample = await page.evaluate(async () => {
      const p = window.__smokeGame.scene.getScene('Room').player;
      const x = p.x, y = p.y, started = performance.now(), frames = [];
      while (performance.now() - started < 1180) {
        if (frames.at(-1) !== p.frame.name) frames.push(p.frame.name);
        await new Promise(requestAnimationFrame);
      }
      return { frames, dx: p.x - x, dy: p.y - y, speed: p.body.velocity.length(),
        width: p.width, height: p.height, bodyWidth: p.body.width, bodyHeight: p.body.height };
    });
    const indices = sample.frames.map(f => Number(f.replace(`walk-${direction}-`, '')));
    ok(new Set(indices).size === frameCount && indices.length >= frameCount + 1 && indices.every((n, i) => !i || n === (indices[i - 1] + 1) % frameCount),
      `${direction}: все ${frameCount} фаз последовательно проигрываются и повторяются`);
    ok(sample.dx * sx > 100 && sample.dy * sy > 100 && Math.abs(sample.speed - 220 * 2 / 3) < .01 &&
      sample.width === 256 && sample.height === 320 && sample.bodyWidth === 20 && sample.bodyHeight === 25,
      `${direction}: верное направление, обычная скорость и прежняя геометрия героя`);
    // Release both keys before the next scene update, like the blur reset path.
    await page.evaluate(() => window.__smokeGame.events.emit('blur'));
    await Promise.all(keys.map(key => page.keyboard.up(key)));
    const idle = await waitState(s => !s.animationPlaying && s.frame === direction && s.vx === 0 && s.vy === 0);
    ok(idle.facing === direction, `${direction}: остановка использует отдельную устойчивую позу`);
    await page.evaluate(() => window.__smokeGame.events.emit('focus'));
  }

  for (const [key, direction] of [['a', 'left'], ['d', 'right']]) {
    await page.evaluate(point => window.__smokeGame.scene.getScene('Room').player.body.reset(point.x, point.y), clearSquare);
    const poses = []; let previous = await state();
    for (let tap = 0; tap < 4; tap++) {
      await page.keyboard.down(key);
      const walking = await waitState(s => s.animationPlaying && s.animationKey === `druid-walk-${direction}`);
      poses.push(walking.frame);
      await delay(65);
      await page.keyboard.up(key);
      const idle = await waitState(s => !s.animationPlaying && s.frame === direction && s.vx === 0);
      assert.ok(Math.abs(idle.x - previous.x) > 0, 'Короткое нажатие действительно двигает героя');
      previous = idle;
    }
    ok(new Set(poses).size === 4, `${direction}: четыре коротких нажатия продолжают шаг, вместо повторения одной позы (${poses.join(', ')})`);
  }

  const observedMouse = await page.evaluate(() => window.__mouseObservation);
  ok(['run', 'rise', 'look', 'lower'].every(state => observedMouse.states.includes(state)) && observedMouse.moving &&
    observedMouse.stopped && observedMouse.matching && observedMouse.clear,
    `Живая мышь пробегает, поднимается, осматривается и опускается; во время осматривания стоит: ${observedMouse.states.join(' → ')}`);
  const mousePhysics = await page.evaluate(async () => {
    const scene = window.__smokeGame.scene.getScene('Room'), mouse = scene.world.mice[0];
    const originalStep = mouse.behavior.step;
    const oldMouse = { x: mouse.x, y: mouse.y }, oldPlayer = { x: scene.player.x, y: scene.player.y };
    const tree = scene.world.obstacles.getChildren()[0].body;
    mouse.behavior.step = () => ({ x: 90, y: 0 });
    mouse.body.reset(tree.x - 27, tree.y + tree.height / 2 + 4);
    await new Promise(resolve => setTimeout(resolve, 550));
    const treeBlocks = Math.abs(mouse.body.right - tree.x) < 1;
    mouse.behavior.step = () => ({ x: 0, y: 0 });
    mouse.body.reset(oldMouse.x, oldMouse.y); mouse.setVelocity(0, 0);
    scene.player.body.reset(oldMouse.x, oldMouse.y - 10);
    await new Promise(resolve => setTimeout(resolve, 250));
    const contact = scene.physics.overlap(scene.player, mouse), noDamage = scene.playerHealth === 3;
    mouse.behavior.step = originalStep;
    scene.player.body.reset(oldPlayer.x, oldPlayer.y);
    return { treeBlocks, contact, noDamage };
  });
  ok(mousePhysics.treeBlocks && mousePhysics.contact && mousePhysics.noDamage,
    'Реальная физика: дерево останавливает мышь; с друидом она пересекается без блокировки и урона');

  await page.evaluate(() => {
    const scene = window.__smokeGame.scene.getScene('Room'), p = scene.player;
    const obstacles = scene.world.obstacles.getChildren().map(o => o.body);
    for (let y = 30; y < scene.layout.height - 30; y += 20) {
      for (let x = 30; x < scene.layout.width - 630; x += 20) {
        if (obstacles.some(o => x - 10 < o.right && x + 610 > o.x && y - 3 < o.bottom && y + 23 > o.y)) continue;
        p.body.reset(x, y);
        window.__speedProbe = { starts: 0, base: p.definition.stats.speed };
        p.on('animationstart', () => window.__speedProbe.starts++);
        return;
      }
    }
    throw new Error('Нет прохода для проверки изменяемой скорости');
  });
  await page.keyboard.down('d');
  await waitState(s => s.animationPlaying && s.animationKey === 'druid-walk-right');
  const speedChanges = await page.evaluate(async () => {
    const p = window.__smokeGame.scene.getScene('Room').player, base = window.__speedProbe.base;
    const samples = [];
    for (const factor of [.5, 2]) {
      p.actorState.speed = base * factor;
      await new Promise(resolve => requestAnimationFrame(resolve));
      const start = p.x, time = performance.now();
      await new Promise(resolve => setTimeout(resolve, 300));
      samples.push({ speed: p.body.velocity.length(), scale: p.anims.timeScale,
        measured: (p.x - start) / ((performance.now() - time) / 1000), expected: base * factor });
    }
    const uninterrupted = window.__speedProbe.starts === 1;
    p.actorState.speed = 0;
    await new Promise(resolve => setTimeout(resolve, 80));
    const stopped = !p.anims.isPlaying && p.frame.name === 'right' && p.body.velocity.length() === 0;
    const baseIntact = p.definition.stats.speed === 220 * 2 / 3 && p.actorState.health === 3;
    p.actorState.speed = base;
    return { samples, uninterrupted, stopped, baseIntact };
  });
  ok(speedChanges.samples.every(s => Math.abs(s.speed - s.expected) < .01 &&
    Math.abs(s.scale - s.expected / 220) < .001 && Math.abs(s.measured - s.expected) < s.expected * .18),
    'Изменение скорости ×0,5 и ×2 меняет реальное перемещение и темп шагов пропорционально');
  ok(speedChanges.uninterrupted && speedChanges.stopped && speedChanges.baseIntact,
    'Модификатор не перезапускает шаг и не меняет базовый тип; скорость 0 останавливает анимацию');
  await page.keyboard.up('d');

  const populationSeeds = await page.evaluate(async () => {
    const { generateMeadow } = await import('/src/world/meadowLayout.ts');
    const { generateMousePopulation } = await import('/src/world/mousePopulation.ts');
    let empty = 0;
    while (generateMousePopulation(generateMeadow(empty)).length) empty++;
    return [empty, 3]; // seed 3 has nine mice.
  });
  for (const seed of populationSeeds) {
    const previous = await page.evaluateHandle(seed => {
      const scene = window.__smokeGame.scene.getScene('Room');
      window.__oldMice = [...scene.world.mice];
      const p = scene.player; scene.scene.restart({ characterId: 'druid', seed }); return p;
    }, seed);
    await page.waitForFunction(p => window.__smokeGame.scene.getScene('Room').player !== p, previous);
    await previous.dispose();
    await waitScene('Room');
    const lifecycle = await page.evaluate(() => {
      const scene = window.__smokeGame.scene.getScene('Room');
      return { count: scene.world.mice.length, cleared: window.__oldMice.every(m => !m.scene),
        sprites: scene.children.list.filter(o => o.name === 'wandering-mouse').length,
        colliders: scene.physics.world.colliders.getActive().length, wolfCount: scene.world.wolves.length,
        speedReset: scene.player.actorState.speed === scene.player.definition.stats.speed };
    });
    ok(lifecycle.count === (seed === populationSeeds[0] ? 0 : 9) && lifecycle.sprites === lifecycle.count &&
      lifecycle.colliders === lifecycle.count + 1 + lifecycle.wolfCount * 2 && lifecycle.cleared && lifecycle.speedReset,
      `Перезапуск с ${lifecycle.count} мышами: нет старых спрайтов/коллайдеров, характеристики героя восстановлены`);
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
  ok(Math.abs(Math.hypot(diagonal.vx, diagonal.vy) - 220 * 2 / 3) < 0.1, 'Диагональ не увеличивает скорость');
  ok(diagonal.facing === 'down-right' && diagonal.animationPlaying && diagonal.animationKey === 'druid-walk-down-right', 'При S+D включается отдельный диагональный ракурс вниз-вправо');
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

  await page.evaluate(() => {
    const scene = window.__smokeGame.scene.getScene('Room');
    scene.player.body.reset(scene.layout.width - 10, 500);
  });
  await page.keyboard.down('s'); await page.keyboard.down('d');
  await delay(100);
  const sliding = await page.evaluate(async () => {
    const p = window.__smokeGame.scene.getScene('Room').player, x = p.x, y = p.y;
    await new Promise(resolve => setTimeout(resolve, 200));
    return { scale: p.anims.timeScale, dx: p.x - x, dy: p.y - y, blocked: p.body.blocked.right };
  });
  ok(sliding.blocked && Math.abs(sliding.dx) < .01 && sliding.dy > 10 &&
    Math.abs(sliding.scale - Math.SQRT1_2 * 2 / 3) < .001,
    'При диагональном скольжении вдоль границы темп учитывает оставшуюся скорость движения');
  await page.keyboard.up('s'); await page.keyboard.up('d');

  // Проверяем активную сосну и сохранённый архив через настоящие клавиши и коллайдеры.
  const installArchivedWorld = async () => page.evaluate(async () => {
    const scene = window.__smokeGame.scene.getScene('Room');
    const { MeadowWorld } = await import('/src/world/MeadowWorld.ts');
    const { generateMeadow } = await import('/src/world/meadowLayout.ts');
    const { ENVIRONMENT_VARIANTS, TREE_SPAWN_POOL } = await import('/src/data/environment.ts');
    const previousChildren = new Set(scene.children.list);
    scene.world.destroy();
    scene.layout = generateMeadow(scene.layout.seed, ENVIRONMENT_VARIANTS.tree.filter(art => !TREE_SPAWN_POOL.includes(art.id)).map(art => art.id));
    scene.world = new MeadowWorld(scene, scene.layout);
    scene.world.bindPlayer(scene.player);
    scene.cameras.getCamera('hud').ignore(scene.children.list.filter(object => !previousChildren.has(object)));
  });
  for (const archived of [false, true]) {
    const kind = 'tree';
    await restart();
    if (archived) { await installArchivedWorld(); await isolateWolf(); }
    assertMeadow(await state());
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

  // Regression: soles can pass just below the visible trunk instead of
  // colliding with an invisible rectangle extending into the grass.
  await restart();
  const pines = await state();
  const pineIndex = pines.obstacles.findIndex((tree, index) => {
    const placement = pines.layout.obstacles[index];
    const corridor = { x: placement.x - 90, right: placement.x + 90,
      y: placement.y - 25, bottom: placement.y + 50 };
    return corridor.x >= 0 && corridor.right <= pines.layout.width && corridor.bottom < pines.layout.height &&
      !pines.obstacles.some((other, i) => i !== index && intersects(corridor, other));
  });
  assert.ok(pineIndex >= 0, 'Нет свободного подхода к сосне снизу');
  const pine = pines.layout.obstacles[pineIndex];
  for (const [key, sign] of [['d', 1], ['a', -1]]) {
    await page.evaluate(({ tree, sign }) => {
      const player = window.__smokeGame.scene.getScene('Room').player;
      // Keep visible soles 12 world units below the image's ground anchor.
      player.body.reset(tree.x - sign * 56, tree.y + 12 - 22.5);
      player.setVelocity(0, 0);
    }, { tree: pine, sign });
    const before = await state();
    await hold(key, 850);
    const after = await state();
    ok((after.x - before.x) * sign > 100 && Math.abs(after.body.bottom - (pine.y + 12)) < .1,
      `Под стволом можно пройти ${sign > 0 ? 'вправо' : 'влево'} без невидимого выступа коллайдера`);
  }
  await page.evaluate(tree => {
    const player = window.__smokeGame.scene.getScene('Room').player;
    player.body.reset(tree.x, tree.y + 45 - 22.5);
    player.setVelocity(0, 0);
  }, pine);
  await hold('w', 600);
  const belowPine = await state();
  const soleGap = belowPine.body.bottom - pine.y;
  ok(soleGap >= 0 && soleGap <= 12 && Math.abs(belowPine.x - pine.x) < .1,
    'Подход снизу останавливается у ствола: зазор у сапог не превышает 12 единиц вместо прежних 25');

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
  const castAssets = await page.evaluate(async () => {
    const { FACINGS } = await import('/src/input/EightWayFacing.ts');
    const { DRUID_CAST_ART, DRUID_CAST_APPEARANCE } = await import('/src/rendering/druidCastArt.ts');
    const game = window.__smokeGame;
    const preserved = await Promise.all(DRUID_CAST_ART.map(async art => {
      const image = new Image();
      const folders = { down: 'druid-cast-front-stable-v1', 'down-left': 'druid-facing-fixes-v1',
        'down-right': 'druid-cast-diagonal-v2', 'up-left': 'druid-cast-layer-fix-v1',
        up: 'druid-cast-layer-fix-v1', right: 'druid-cast-layer-fix-v1', 'up-right': 'druid-cast-layer-fix-v1' };
      const folder = folders[art.direction] ?? 'druid-cast-eight-way-v1';
      image.src = `/docs/art/${folder}/cast-${art.direction}-512x384.png`;
      await image.decode();
      const texture = game.textures.get(art.key), frames = DRUID_CAST_APPEARANCE[art.direction].frames;
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 384;
      const context = canvas.getContext('2d');
      return texture.source[0].scaleMode === 1 && frames.length === 6 && frames.every((name, index) => {
        context.clearRect(0, 0, 512, 384); context.drawImage(image, (index + 1) * 512, 0, 512, 384, 0, 0, 512, 384);
        const expected = context.getImageData(0, 0, 512, 384).data;
        const frame = texture.get(name);
        context.clearRect(0, 0, 512, 384);
        context.drawImage(texture.getSourceImage(), frame.cutX, frame.cutY, 512, 384, 0, 0, 512, 384);
        const actual = context.getImageData(0, 0, 512, 384).data;
        return actual.every((value, i) => value === expected[i]);
      });
    }));
    return { count: FACINGS.length, preserved: preserved.every(Boolean) };
  });
  ok(castAssets.count === 8 && castAssets.preserved,
    'Атаки всех восьми направлений загружены из выбранных PNG 1:1 с NEAREST');
  const stableFront = await page.evaluate(() => {
    const game = window.__smokeGame;
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 320;
    const ctx = canvas.getContext('2d');
    const sample = (texture, frame, x, y, width, height) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(texture.getSourceImage(), frame.cutX + x, frame.cutY + y, width, height, 0, 0, width, height);
      return ctx.getImageData(0, 0, width, height).data;
    };
    const same = (a, b) => a.every((value, i) => value === b[i]);
    const standing = game.textures.get('druid-game');
    const legs = ['down', 'down-left'].every(direction => {
      const expected = sample(standing, standing.get(direction), 60, 235, 110, 65);
      const cast = game.textures.get(`druid-cast-${direction}`);
      return Array.from({ length: 6 }, (_, i) => cast.get(`cast-${direction}-${i}`))
        .every(frame => same(sample(cast, frame, 128 + 60, 40 + 235, 110, 65), expected));
    });
    const walk = game.textures.get('druid-walk-down-source');
    const cast = game.textures.get('druid-cast-down');
    const head = same(sample(walk, walk.get(), 110, 55, 35, 32),
      sample(cast, cast.get('cast-down-0'), 128 + 110, 40 + 55, 35, 32));
    return { legs, head };
  });
  ok(stableFront.legs, 'Касты вниз и вниз-влево: ноги и сапоги во всех шести фазах совпадают со стойкой, без расширения');
  ok(stableFront.head, 'При касте вниз голова смотрит прямо как в принятой ходьбе вниз');
  const facingFixes = await page.evaluate(async () => {
    const game = window.__smokeGame;
    const read = image => {
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const png = async path => { const image = new Image(); image.src = `/docs/art/${path}`; await image.decode(); return read(image); };
    const reference = await png('druid-cast-down-v1/staff-master-256x320.png');
    const meanLight = (pixels, selected) => {
      let sum = 0, count = 0;
      for (let i = 0; i < pixels.length; i += 4) if (selected(i)) {
        sum += .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2]; count++;
      }
      return sum / count;
    };
    const referenceLight = meanLight(reference, i => reference[i + 3] > 0);
    let woodOnly = true;
    let tunicOnly = true;
    for (const [kind, textureKey] of [['idle', 'druid-left-source'], ['walk', 'druid-walk-left-source']]) {
      const original = await png(`druid-eight-way-v1/${kind}-left-256x320.png`);
      const mask = await png(`druid-facing-fixes-v1/${kind}-left-wood-mask.png`);
      const previous = await png(`druid-facing-fixes-v1/${kind}-left-256x320.png`);
      const tunicMask = await png(`druid-left-tunic-v1/${kind}-left-tunic-mask.png`);
      const actual = read(game.textures.get(textureKey).getSourceImage());
      let changed = 0, changedCloth = 0;
      for (let i = 0; i < actual.length; i += 4) {
        woodOnly &&= actual[i + 3] === original[i + 3];
        const different = [0, 1, 2].some(c => actual[i + c] !== original[i + c]);
        if (mask[i] === 0 && tunicMask[i] === 0) woodOnly &&= !different;
        if (mask[i] > 0 && different) changed++;
        const clothDifferent = [0, 1, 2].some(c => actual[i+c] !== previous[i+c]);
        tunicOnly &&= actual[i+3] === previous[i+3];
        if (tunicMask[i] === 0) tunicOnly &&= !clothDifferent;
        else if (clothDifferent) changedCloth++;
      }
      tunicOnly &&= changedCloth > 1500;
      woodOnly &&= changed > 1000 && Math.abs(meanLight(actual, i => mask[i] > 0) - referenceLight) < 3;
    }
    const idle = read(game.textures.get('druid-down-left-source').getSourceImage());
    const body = await png('druid-facing-fixes-v1/body-down-left-fixed-256x320.png');
    let contour = true;
    for (let i = 3; i < body.length; i += 4) if (body[i] && !idle[i]) contour = false;
    return { woodOnly, tunicOnly, contour };
  });
  ok(facingFixes.woodOnly, 'Посох в стойке и ходьбе влево сохраняет основной тон; вне посоха и туники пиксели прежние');
  ok(facingFixes.tunicOnly, 'Влево: обновлены только панели туники в стойке и ходьбе; плащ, руки, ноги, посох и весь alpha сохранены точно');
  ok(facingFixes.contour, 'Неподвижный корпус каста вниз-влево полностью вписан в силуэт стойки, без добавленной ширины');
  const layeredCasts = await page.evaluate(async () => {
    const game = window.__smokeGame;
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 384;
    const ctx = canvas.getContext('2d');
    const png = async file => { const image = new Image(); image.src = `/docs/art/druid-cast-layer-fix-v1/${file}`; await image.decode(); return image; };
    const read = (image, x, y, width = 512, height = 384, targetX = 0, targetY = 0) => {
      ctx.clearRect(0, 0, 512, 384); ctx.drawImage(image, x, y, width, height, targetX, targetY, width, height);
      return ctx.getImageData(0, 0, 512, 384).data;
    };
    const result = {};
    for (const direction of ['up', 'up-left', 'up-right', 'right']) {
      const [bodyImage, armImage, staffImage] = await Promise.all([
        png(`body-${direction}-fixed-256x320.png`), png(`arm-${direction}-poses-512x384.png`),
        png(`staff-${direction}-poses-512x384.png`)]);
      const fixed = read(bodyImage, 0, 0, 256, 320, 128, 40);
      const texture = game.textures.get(`druid-cast-${direction}`);
      let valid = true;
      for (let phase = 0; phase < 6; phase++) {
        const arm = read(armImage, phase * 512, 0), staff = read(staffImage, phase * 512, 0);
        const frame = texture.get(`cast-${direction}-${phase}`);
        const actual = read(texture.getSourceImage(), frame.cutX, frame.cutY);
        for (let i = 0; i < actual.length; i += 4) {
          if (fixed[i + 3]) valid &&= [0, 1, 2, 3].every(c => actual[i + c] === fixed[i + c]);
          if (actual[i + 3]) valid &&= !!(fixed[i + 3] || arm[i + 3] || staff[i + 3]);
          // A moving-arm layer must not contain a second hem, legs or body.
          if (Math.floor(i / 4 / 512) >= 210) valid &&= arm[i + 3] === 0;
        }
      }
      result[direction] = valid;
    }
    return result;
  });
  for (const [direction, valid] of Object.entries(layeredCasts))
    ok(valid, `${direction}: один неизменный корпус, отдельная движущаяся рука; нет второго подола, ног или свободной руки`);
  const castState = () => page.evaluate(() => {
    const scene = window.__smokeGame.scene.getScene('Room'), p = scene.player, v = p.castVisual;
    return { active: p.casting.active, facing: p.actorState.facing, phase: p.casting.frameIndex,
      texture: v.texture.key, frame: v.frame.name, visible: v.visible, playerVisible: p.visible,
      idle: p.frame.name, x: p.x, y: p.y, bodyWidth: p.body.width, bodyHeight: p.body.height,
      vx: p.body.velocity.x, vy: p.body.velocity.y, speedStat: p.actorState.speed,
      bodyX: p.body.x, bodyY: p.body.y, bodyRight: p.body.right, bodyBottom: p.body.bottom,
      visualX: v.x, visualY: v.y, alignedFeet: v.y - v.displayOriginY * v.scaleY + 340 * v.scaleY,
      playerFeet: p.y - p.displayOriginY * p.scaleY + 300 * p.scaleY,
      depth: v.depth, playerDepth: p.depth, scale: v.scaleX, cameraFilter: v.cameraFilter,
      hudId: scene.cameras.getCamera('hud').id };
  });
  const waitCast = async predicate => {
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      const s = await castState(); if (predicate(s)) return s; await delay(20);
    }
    throw new Error(`Состояние атаки не достигнуто: ${JSON.stringify(await castState())}`);
  };
  const beforeCasts = await castState();
  await page.keyboard.press('ArrowDown');
  await waitCast(s => s.active && s.facing === 'down');
  await waitCast(s => !s.active && s.playerVisible);
  ok(true, 'Короткое нажатие стрелки тоже запускает полный жест, даже между кадрами игры');
  for (const [direction, arrows] of [
    ['down', ['ArrowDown']], ['up', ['ArrowUp']], ['left', ['ArrowLeft']], ['right', ['ArrowRight']],
    ['down-left', ['ArrowDown', 'ArrowLeft']], ['down-right', ['ArrowDown', 'ArrowRight']],
    ['up-left', ['ArrowUp', 'ArrowLeft']], ['up-right', ['ArrowUp', 'ArrowRight']],
  ]) {
    for (const arrow of arrows) await page.keyboard.down(arrow);
    const s = await waitCast(s => s.active && s.facing === direction);
    ok(s.texture === `druid-cast-${direction}` && s.visible && !s.playerVisible &&
      s.bodyWidth === 20 && s.bodyHeight === 25 && s.visualX === s.x && s.visualY === s.y &&
      Math.abs(s.alignedFeet - s.playerFeet) < .001 && s.depth === s.playerDepth &&
      Math.abs(s.scale - 87.5 / 256) < .0001 && (s.cameraFilter & s.hudId) !== 0,
      `Стрелки: атака ${direction}, прежний масштаб, опора ног, глубина и коллайдер 20×25`);
    if (direction === 'down') {
      const phases = await page.evaluate(async () => {
        const p = window.__smokeGame.scene.getScene('Room').player, seen = new Set(), transitions = [];
        const end = performance.now() + 1500; let previous = -1;
        while (performance.now() < end) {
          const phase = p.casting.frameIndex; seen.add(phase);
          if (phase !== previous) { transitions.push(phase); previous = phase; }
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
        return { seen: [...seen], transitions, active: p.casting.active };
      });
      ok(phases.seen.length === 6 && phases.active && phases.transitions.slice(1).every((phase, i) =>
        phase === (phases.transitions[i] + 1) % 6),
        'Удержание стрелки проходит шесть фаз по порядку и повторяет жест, не сбрасывая его каждый кадр');
      await page.screenshot({ path: fileURLToPath(new URL('../test-results/casting-down.png', import.meta.url)) });
    }
    for (const arrow of arrows) await page.keyboard.up(arrow);
    // Real keyup events may straddle a rendered frame: the remaining arrow
    // legitimately turns a diagonal cast before the second key is released.
    const finishingFacing = (await castState()).facing;
    const idle = await waitCast(s => !s.active && !s.visible && s.playerVisible && s.idle === finishingFacing);
    ok(idle.x === beforeCasts.x && idle.y === beforeCasts.y && idle.bodyX === beforeCasts.bodyX &&
      idle.bodyY === beforeCasts.bodyY && idle.bodyRight === beforeCasts.bodyRight && idle.bodyBottom === beforeCasts.bodyBottom,
      `После ${direction}: жест заканчивается, друид остаётся в стойке нужного направления без сдвига тела`);
  }
  await page.keyboard.down('ArrowUp');
  await waitCast(s => s.active && s.phase >= 2);
  const phaseBeforeTurn = (await castState()).phase;
  await page.keyboard.down('ArrowRight');
  const diagonalCast = await waitCast(s => s.active && s.facing === 'up-right');
  ok(diagonalCast.phase >= phaseBeforeTurn,
    'Добавление второй стрелки во время жеста переключает диагональ без сброса фазы');
  await page.keyboard.up('ArrowUp');
  await waitCast(s => s.active && s.facing === 'right');
  await page.keyboard.up('ArrowRight');
  await waitCast(s => !s.active);
  await page.evaluate(() => {
    const scene = window.__smokeGame.scene.getScene('Room');
    const obstacles = scene.world.obstacles.getChildren().map(o => o.body);
    for (let y = 80; y < scene.layout.height - 200; y += 40) {
      for (let x = 80; x < scene.layout.width - 80; x += 40) {
        if (!obstacles.some(o => x - 10 < o.right && x + 10 > o.x && y < o.bottom && y + 180 > o.y)) {
          scene.player.body.reset(x, y); return;
        }
      }
    }
    throw new Error('Нет прохода для проверки остановки при атаке и возобновления ходьбы');
  });
  const beforeWalk = await castState();
  await page.keyboard.down('s');
  await waitState(s => s.y > beforeWalk.y + 12 && s.animationKey === 'druid-walk-down');
  await page.keyboard.down('ArrowRight');
  const castingStop = await waitCast(s => s.active && s.vx === 0 && s.vy === 0);
  const stationary = await page.evaluate(async () => {
    const p = window.__smokeGame.scene.getScene('Room').player;
    const x = p.x, y = p.y, phases = new Set();
    const end = performance.now() + 1500;
    let frozen = true;
    while (performance.now() < end) {
      frozen &&= p.x === x && p.y === y && p.body.velocity.length() === 0 && p.casting.active;
      phases.add(p.casting.frameIndex);
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return { frozen, phases: phases.size, walkStopped: !p.anims.isPlaying };
  });
  ok(stationary.frozen && stationary.phases === 6 && stationary.walkStopped &&
    castingStop.speedStat === beforeWalk.speedStat,
    'Начало каста останавливает ходьбу; удержание S и стрелки не сдвигает героя даже между повторами и не меняет скорость');
  await page.keyboard.up('ArrowRight');
  const finishingCast = await castState();
  await waitCast(s => !s.active && s.playerVisible);
  const resumed = await waitState(s => s.y > finishingCast.y + 12 && s.animationPlaying && s.animationKey === 'druid-walk-down');
  ok(resumed.vy > 0 && resumed.vx === 0 && resumed.facing === 'down',
    'После отпускания стрелки и завершения жеста удерживаемая S снова включает ходьбу вниз');
  await page.keyboard.press('ArrowUp');
  const tappedCast = await waitCast(s => s.active && s.facing === 'up' && s.vx === 0 && s.vy === 0);
  await delay(150);
  const duringTap = await castState();
  ok(duringTap.active && duringTap.x === tappedCast.x && duringTap.y === tappedCast.y,
    'Короткое нажатие стрелки блокирует ходьбу до конца жеста, даже когда стрелка уже отпущена');
  await waitCast(s => !s.active);
  await waitState(s => s.animationKey === 'druid-walk-down' && s.vy > 0);
  await page.keyboard.down('ArrowDown'); await page.keyboard.down('ArrowRight');
  const diagonalStop = await waitCast(s => s.active && s.facing === 'down-right' && s.vx === 0 && s.vy === 0);
  await delay(200);
  const duringDiagonal = await castState();
  ok(duringDiagonal.x === diagonalStop.x && duringDiagonal.y === diagonalStop.y,
    'Диагональный каст тоже останавливает героя при удерживаемой WASD');
  await page.keyboard.up('s'); await page.keyboard.up('ArrowDown'); await page.keyboard.up('ArrowRight');
  const diagonalEndFacing = (await castState()).facing;
  await waitCast(s => !s.active && s.idle === diagonalEndFacing);
  await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowDown');
  // The two real keydown events can land on adjacent rendered frames. Let a
  // gesture started by the first key finish; the conflicting pair must not
  // start or repeat another one.
  await delay(800);
  ok(!(await castState()).active, 'Противоположные стрелки отменяют друг друга и не запускают новую атаку');
  await page.keyboard.up('ArrowUp'); await page.keyboard.up('ArrowDown');
  await page.keyboard.down('ArrowLeft'); await waitCast(s => s.active);
  await page.evaluate(() => window.__smokeGame.events.emit('blur'));
  ok(!(await castState()).active && (await castState()).playerVisible, 'Потеря фокуса отменяет жест и сбрасывает ввод');
  await page.keyboard.up('ArrowLeft');
  await page.evaluate(() => window.__smokeGame.events.emit('focus'));
  await page.keyboard.down('ArrowDown'); await waitCast(s => s.active);
  const oldCast = await page.evaluateHandle(() => window.__smokeGame.scene.getScene('Room').player.castVisual);
  await restart(); await page.keyboard.up('ArrowDown');
  ok(await page.evaluate(old => !old.scene && window.__smokeGame.scene.getScene('Room').children.list.filter(
    o => o.name === 'druid-casting').length === 1, oldCast), 'Перезапуск удаляет прежнее изображение атаки, без дубликатов');
  await oldCast.dispose();
  await waitCast(s => !s.active);
  await hold('ArrowRight', 350);
  const peaceful = await state();
  ok(!peaceful.combat && peaceful.acornEnabled && peaceful.health === 3, 'Старый бой с жуком отключён; пробная атака желудем подключена без потери HP');
  const oldSeed = peaceful.layout.seed;
  const floorSignature = () => page.evaluate(() => {
    const floor = window.__smokeGame.scene.getScene('Room').children.getByName('forest-floor');
    const canvas = floor.texture.getSourceImage();
    const pixels = canvas.getContext('2d').getImageData(canvas.width / 2 - 64, canvas.height / 2 - 64, 128, 128).data;
    let hash = 2166136261;
    for (const value of pixels) hash = Math.imul(hash ^ value, 16777619);
    return hash >>> 0;
  });
  const oldFloor = await floorSignature();
  await restart();
  const regenerated = await state();
  ok(regenerated.layout.seed !== oldSeed && await floorSignature() !== oldFloor &&
    regenerated.layout.counts.trees >= 70 && regenerated.layout.counts.trees <= 99 &&
    regenerated.obstacles.filter(object=>object.kind==='tree').every(object => ['forest-pine','forest-broadleaf'].includes(object.texture)) &&
    ['forest-pine','forest-broadleaf'].every(texture=>regenerated.obstacles.some(object=>object.texture===texture)),
    'R меняет случайную подстилку и размещение двух пород деревьев; архивные деревья остаются выключены');
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
  await waitScene('MainMenu');
  ok((await activeScenes()).join() === 'MainMenu', 'Esc из живого забега сохраняет его и возвращает в главное меню');
  await clickNamed('MainMenu', 'play');
  await waitScene('CharacterSelect');
  for (let run = 0; run < 3; run++) {
    await page.keyboard.press('Enter');
    await waitScene('Room');
    assertMeadow(await state());
    await page.keyboard.press('Escape');
    await waitScene('MainMenu');
    ok(await page.evaluate(() => !window.__smokeGame.textures.exists('grass-foreground')),
      `Выход из поляны освобождает текстуру передней травы: ${run + 1}`);
    await clickNamed('MainMenu', 'play');
    await waitScene('CharacterSelect');
    ok((await activeScenes()).join() === 'CharacterSelect', `Повторные переходы без лишних сцен: ${run + 1}`);
  }
  await testWolf(page, ok);
  await testDruidHits(page, ok);
  await testAcornAttack(page, ok);
  await testWolfCombat(page, ok);
  await testAcornRange(page, ok);
  await testWolfPack(page, ok);
  await testMenuSession(page, ok);
  ok(errors.length === 0, `Нет ошибок браузера: ${errors.join('; ')}`);
  console.log(`\nПроверок пройдено: ${passed}.`);
} catch (error) {
  console.error('Ошибки браузера при сбое:', errors);
  throw error;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
