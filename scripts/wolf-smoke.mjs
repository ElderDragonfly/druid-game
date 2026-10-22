import { isolateSingleWolf } from './wolf-fixture.mjs';
import { testWolfCloak } from './wolf-cloak-smoke.mjs';
/** Real browser scenarios for wolf AI, physics and distance-driven art. */
export async function testWolf(page, ok) {
  const pure = await page.evaluate(async () => {
    const { WolfNavigation } = await import('/src/world/WolfNavigation.ts');
    const { WolfBehavior } = await import('/src/behavior/WolfBehavior.ts');
    const { WOLF } = await import('/src/data/wolf.ts');
    const { BASE_MOVEMENT_SPEED } = await import('/src/data/movement.ts');
    const { CHARACTERS } = await import('/src/data/characters.ts');
    const { generateMeadow } = await import('/src/world/meadowLayout.ts');
    const { generateWolfPopulation } = await import('/src/world/wolfPopulation.ts');
    const layout = { width: 800, height: 600, seed: 10, spawn: { x: 100, y: 100 }, counts: { trees: 0 }, obstacles: [] };
    const nav = new WolfNavigation(layout), ai = new WolfBehavior(nav, { x: 400, y: 300 });
    const center = { x: 400, y: 300 };
    const detection = ai.detects(center, { x: 826, y: 300 }) && !ai.detects(center, { x: 828, y: 300 }) &&
      ai.detects(center, { x: 400, y: 539 }) && !ai.detects(center, { x: 400, y: 541 }) &&
      !ai.detects(center, { x: 800, y: 520 });
    const rect = p => ({ x: p.x - 10, y: p.y - 25, width: 20, height: 25 });
    const near = { x: 500, y: 300 }, far = { x: 750, y: 550 };
    const first = ai.step(16, center, near, rect(near));
    ai.step(16, center, far, rect(far));
    const sticky = ai.actorState.alerted && ai.actorState.phase === 'chase';
    const attack = new WolfBehavior(nav, center), contact = { x: 430, y: 300 };
    attack.step(16, center, contact, rect(contact));
    const startedAttack = attack.actorState.phase === 'attack';
    const locked = attack.step(200, center, far, rect(far));
    attack.step(500, center, far, rect(far));
    const resumed = attack.actorState.phase === 'chase';
    const wander = new WolfBehavior(nav, center), phases = new Set(); let position = { ...center }, wanderingSpeed = 0;
    for (let i = 0; i < 600; i++) {
      const v = wander.step(16, position, { x: -2000, y: -2000 }, rect({ x: -2000, y: -2000 }));
      phases.add(wander.actorState.phase); wanderingSpeed = Math.max(wanderingSpeed, Math.hypot(v.x, v.y));
      position = { x: position.x + v.x * .016, y: position.y + v.y * .016 };
    }
    const wall = { ...layout, obstacles: [{ kind: 'tree', variant: 0, x: 220, y: 302 }] };
    const wallNav = new WolfNavigation(wall), a = { x: 110, y: 300 }, b = { x: 340, y: 300 };
    const route = wallNav.route(a, b);
    const routed = !wallNav.clear(a, b) && route.length > 1 && route.every((p, i) => wallNav.clear(i ? route[i - 1] : a, p)) &&
      Math.hypot(route.at(-1).x - b.x, route.at(-1).y - b.y) < 1;
    let spawnValid = true;
    for (let seed = 0; seed < 12; seed++) {
      const meadow = generateMeadow(seed), navigation = new WolfNavigation(meadow), spawns = generateWolfPopulation(navigation);
      const p = { x: meadow.spawn.x, y: meadow.spawn.y + 22.5 };
      spawnValid &&= spawns.every(spawn=>navigation.canStand(spawn) &&
        !new WolfBehavior(navigation, spawn).detects(spawn, p) && navigation.route(spawn, p).length > 0);
    }
    return { detection, sticky, startedAttack, locked: locked.x === 0 && locked.y === 0, resumed,
      wander: phases.has('idle') && phases.has('wander') && !wander.actorState.alerted,
      speed: Math.abs(Math.hypot(first.x, first.y) - WOLF.stats.runSpeed) < .001,
      ratio: WOLF.stats.runSpeed / CHARACTERS[0].stats.speed, base: CHARACTERS[0].stats.speed === BASE_MOVEMENT_SPEED,
      walk: Math.abs(wanderingSpeed - WOLF.stats.walkSpeed) < .001, routed, spawnValid };
  });
  ok(pure.detection, 'Волк замечает друида внутри овала 426,67×240, а за границей и в углах — нет');
  ok(pure.sticky, 'После обнаружения погоня сохраняется за пределами зоны видимости');
  ok(pure.base && Math.abs(pure.ratio-.9)<1e-9 && pure.speed && pure.walk, 'Скорость друида 1, бега волка 0,9, ходьбы волка 0,45; диагональ нормализована');
  ok(pure.startedAttack && pure.locked && pure.resumed, 'У контакта волк выполняет полный жест атаки и затем возобновляет погоню');
  ok(pure.wander, 'Без друида волк чередует спокойную ходьбу и остановки');
  ok(pure.routed, 'Маршрут огибает ствол с учётом всей ширины волка, без срезания углов');
  ok(pure.spawnValid, 'На 12 seed волк появляется вне обнаружения, без пересечений и с доступом к друиду');

  await page.evaluate(() => window.__smokeGame.scene.start('Room', { characterId: 'druid', seed: 0 }));
  await page.waitForFunction(() => {
    const s = window.__smokeGame.scene.getScene('Room');
    return s.sys.isActive() && s.world?.wolves?.[0]?.body?.enable;
  });
  await isolateSingleWolf(page);
  const initial = await page.evaluate(async () => {
    const s = window.__smokeGame.scene.getScene('Room'), w = s.world.wolves[0];
    const { WOLF_ART } = await import('/src/rendering/wolfArt.ts');
    return { count: s.children.list.filter(o => o.name === 'wolf').length,
      colliders: s.physics.world.colliders.getActive().length === s.world.mice.length + 3,
      outside: !w.behavior.detects(w, { x: s.player.body.center.x, y: s.player.body.bottom }),
      width: w.body.width, height: w.body.height, scale: w.scaleX,
      hud: [w, w.shadow].every(o => o.cameraFilter & s.cameras.getCamera('hud').id),
      art: WOLF_ART.every(a => s.textures.get(a.key).source[0].scaleMode === 1),
      health: s.playerHealth };
  });
  ok(initial.count === 1 && initial.colliders && initial.outside, 'В игре ровно один волк вне зоны обнаружения, с двумя новыми коллайдерами');
  ok(initial.width === 54 && initial.height === 18 && initial.scale === .75 && initial.hud && initial.art,
    'Размер волка, физическое основание, NEAREST и отдельная исходная тень подключены корректно');

  await page.evaluate(() => {
    const s = window.__smokeGame.scene.getScene('Room'), w = s.world.wolves[0], nav = w.behavior.navigation;
    let fixture;
    for (let y = 350; y < 1800 && !fixture; y += 100) for (let x = 350; x < 3400 && !fixture; x += 100) {
      let free = true;
      for (let dy = -60; dy <= 60; dy += 12) for (let dx = -280; dx <= 280; dx += 12)
        if (!nav.canStand({ x: x + dx, y: y + dy })) free = false;
      if (free) fixture = { x, y };
    }
    if (!fixture) throw new Error('No clear wolf physics fixture');
    window.__wolfFixture = fixture;
    s.player.body.reset(fixture.x, fixture.y - 22.5);
    w.body.reset(fixture.x - 220, fixture.y);
    window.__wolfObservation = { frames: new Set(), ratios: [], previous: undefined };
    const observe = () => {
      const o = window.__wolfObservation, prior = o.previous;
      if (w.texture.key === 'wolf-run') {
        o.frames.add(w.frame.name);
        if (prior?.texture === w.texture.key && w.clock > prior.clock) {
          const distance = Math.hypot(w.x - prior.x, w.y - prior.y);
          if (distance > .01) o.ratios.push((w.clock - prior.clock) / distance);
        }
      }
      o.previous = { x: w.x, y: w.y, clock: w.clock, texture: w.texture.key };
    };
    s.events.on('postupdate', observe); window.__wolfObserver = observe;
  });
  await page.waitForFunction(() => window.__smokeGame.scene.getScene('Room').world.wolves[0].actorState.phase === 'attack', null, { timeout: 6000 });
  const contact = await page.evaluate(() => {
    const s = window.__smokeGame.scene.getScene('Room'), w = s.world.wolves[0], p = s.player.body, b = w.body;
    const overlap = Math.min(p.right, b.right) - Math.max(p.x, b.x) > .1 && Math.min(p.bottom, b.bottom) - Math.max(p.y, b.y) > .1;
    const o = window.__wolfObservation;
    return { overlap, phase: w.actorState.phase, health: s.playerHealth, frames: o.frames.size,
      synced: o.ratios.length > 2 && o.ratios.every(r => Math.abs(r - 1000 / w.definition.appearance.runReferenceSpeed) < .001),
      matchingShadow: w.shadow.texture.key === `${w.texture.key}-shadow` && w.shadow.frame.name === w.frame.name };
  });
  ok(contact.phase === 'attack' && !contact.overlap && contact.health === initial.health,
    'Живой волк добегает, останавливается у друида и атакует без урона и пересечения тел');
  ok(contact.frames >= 3 && contact.synced && contact.matchingShadow,
    'Бег меняет кадры по пройденному расстоянию; тень повторяет тот же кадр');
  await page.keyboard.down('a'); await page.waitForTimeout(450); await page.keyboard.up('a');
  const blocked = await page.evaluate(() => {
    const s = window.__smokeGame.scene.getScene('Room'), p = s.player.body, w = s.world.wolves[0].body;
    return { x: s.player.x, collision: p.x >= w.right - .2, health: s.playerHealth };
  });
  ok(blocked.collision && blocked.health === initial.health - 1, 'Друид не проходит сквозь волка при нажатии WASD; активный укус снимает 1 HP');
  await page.evaluate(() => {
    const s = window.__smokeGame.scene.getScene('Room'), f = window.__wolfFixture;
    s.player.body.reset(f.x + 650, f.y - 22.5);
    window.__wolfPursuitStart = s.world.wolves[0].x;
  });
  await page.waitForTimeout(900);
  ok(await page.evaluate(() => {
    const s = window.__smokeGame.scene.getScene('Room'), w = s.world.wolves[0];
    return w.actorState.alerted && w.actorState.phase === 'chase' && w.x > window.__wolfPursuitStart + 20;
  }), 'Волк продолжает погоню, когда друид покидает исходный овал');

  const oldWolf = await page.evaluateHandle(() => {
    const s = window.__smokeGame.scene.getScene('Room'), w = s.world.wolves[0];
    s.events.off('postupdate', window.__wolfObserver); s.scene.restart({ seed: 0 }); return w;
  });
  await page.waitForFunction(old => {
    const s = window.__smokeGame.scene.getScene('Room');
    // Arcade inserts newly created colliders on its next physics update.
    return s.world.wolves[0] !== old && s.world.wolves[0]?.body?.enable &&
      s.physics.world.colliders.getActive().length === s.world.mice.length + 1 + s.world.wolves.length * 2;
  }, oldWolf);
  await isolateSingleWolf(page);
  const clean = await page.evaluate(old => {
    const s = window.__smokeGame.scene.getScene('Room');
    return !old.scene && !old.shadow.scene && s.children.list.filter(o => o.name === 'wolf').length === 1 &&
      s.physics.world.colliders.getActive().length === s.world.mice.length + 3 && !s.world.wolves[0].actorState.alerted;
  }, oldWolf);
  await oldWolf.dispose();
  ok(clean, 'Перезапуск удаляет старого волка, его тень и коллайдеры; новый волк спокоен');
  await testWolfCloak(page,ok);
}
