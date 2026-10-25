/** Walk-through scenery, actor visibility, seeded placement and save validation. */
export async function testBushes(page, ok, waitScene) {
  ok(await page.evaluate(async () => {
    const { generateMeadow, obstacleRect, overlaps } = await import('/src/world/meadowLayout.ts');
    const { bushVisualRect, generateBushes } = await import('/src/world/bushes.ts');
    const { stumpClearing } = await import('/src/world/stump.ts');
    const { ritualTreeClearing } = await import('/src/world/rooms.ts');
    const { groveInterior, rectTouchesGroveClearing } = await import('/src/world/witchGrove.ts');
    const { logVisualRect } = await import('/src/world/fallenLogs.ts');
    const variants = new Set(), counts = new Set();
    for (let seed = 0; seed < 200; seed++) {
      const l = generateMeadow(seed), bushes = l.bushes;
      if (bushes.length < 24 || bushes.length > 36 || bushes.length >= l.counts.trees ||
        l.counts.bushes !== bushes.length || JSON.stringify(bushes) !== JSON.stringify(generateBushes(l))) return false;
      counts.add(bushes.length);
      const room = groveInterior(l);
      const reserved = [stumpClearing(l.stump), ...l.obstacles.map(obstacleRect),
        ...l.logs.map(logVisualRect), ...l.rooms.flatMap(r => r.tree ? [ritualTreeClearing(r.tree)] : []),
        { x: l.spawn.x - 80, y: l.spawn.y - 100, width: 160, height: 180 }];
      for (const [i, b] of bushes.entries()) {
        variants.add(b.variant); const r = bushVisualRect(b);
        if (r.x < room.x + 12 || r.y < room.y + 12 || r.x + r.width > room.x + room.width - 12 || r.y + r.height > room.y + room.height - 12 ||
          rectTouchesGroveClearing(r,l.witchCircle) || reserved.some(a => overlaps(r, a, 8)) || bushes.slice(0, i).some(a => overlaps(r, bushVisualRect(a), 8))) return false;
      }
    }
    return variants.size === 1 && variants.has(2) && counts.size === 13;
  }), '200 seed: 24–36 кустов одного принятого вида в левой средней комнате вне ведьминого круга; отступ от границ 12, от стволов и соседних кустов 8');
  ok(await page.evaluate(() => {
    const s = window.__smokeGame.scene.getScene('Room'), b = s.world.bushes;
    return b.foliage.length === s.layout.bushes.length &&
      b.foliage.every(o => !o.body && o.cameraFilter & s.hudCamera.id && o.texture.source[0].scaleMode === 1 &&
        Math.abs(o.displayWidth - 102 * 86 / 75 * 7 / 12) < 1e-6 && Math.abs(o.displayHeight - 86 * 7 / 12) < 1e-6) &&
      !s.children.list.some(o => o.name.startsWith('bush-collider-')) && !s.textures.exists('forest-bush-ground') && !s.children.list.some(o => o.name.startsWith('bush-ground-'));
  }), 'Новый куст сохраняет прежнюю видимую высоту, проходимость, NEAREST и фильтр HUD, без подложек');
  const arena = await page.evaluate(async () => {
    const s = window.__smokeGame.scene.getScene('Room'); s.physics.pause();
    const { bushVisualRect } = await import('/src/world/bushes.ts');
    const { WolfNavigation } = await import('/src/world/WolfNavigation.ts');
    const nav = new WolfNavigation(s.layout, { width: 20, height: 25 });
    const offset = s.player.body.bottom - s.player.y;
    for (const [index, b] of s.layout.bushes.entries()) {
      const r = bushVisualRect(b), y = b.y - 8, from = { x: r.x - 30, y }, to = { x: r.x + r.width + 30, y };
      if (r.x < 200 || r.y < 180 || r.x + r.width > s.layout.width - 200 ||
        r.y + r.height > s.layout.height - 180 || !nav.clear(from, to)) continue;
      s.player.cancelCast(); s.player.cancelHit(); s.player.body.reset(from.x, y - offset); s.player.body.updateFromGameObject();
      s.physics.resume(); return { index, from, to, width: r.width, offset };
    }
    throw new Error('Нет свободного куста для проверки прохода');
  });
  await page.keyboard.down('d'); await page.waitForTimeout((arena.to.x - arena.from.x) / (220 * 2 / 3) * 1000 + 120); await page.keyboard.up('d');
  ok(await page.evaluate(a => {
    const s = window.__smokeGame.scene.getScene('Room');
    return s.player.x >= a.to.x - 4 && !s.physics.overlap(s.player, s.world.obstacles);
  }, arena), 'Настоящее движение D проходит куст насквозь: не упирается в листву и не получает коллизию');
  await page.evaluate(a => {
    const s = window.__smokeGame.scene.getScene('Room'), b = s.layout.bushes[a.index]; s.physics.pause();
    s.player.body.reset(b.x, b.y + 12 - a.offset); s.player.body.updateFromGameObject();
    s.player.actorState.facing = 'down'; s.player.updateAppearance(true);
    s.cameraFollow.center.x = b.x; s.cameraFollow.center.y = b.y; s.cameras.main.centerOn(b.x, b.y);
  }, arena);
  await page.waitForTimeout(100);
  ok(await page.evaluate(a => {
    const s = window.__smokeGame.scene.getScene('Room'), b = s.world.bushes.foliage[a.index];
    window.__bushRenderA = new Uint8ClampedArray(window.__smokeGame.canvas.getContext('2d').getImageData(0, 0, window.__smokeGame.canvas.width, window.__smokeGame.canvas.height).data);
    s.player.setAlpha(0);
    return b.depth > s.children.getByName('forest-floor').depth &&
      b.depth < s.player.depth && b.depth < s.player.castVisual.depth && b.depth < s.player.hitVisual.depth;
  }, arena), 'Кусты находятся над землёй, но под друидом, включая слои каста и попадания');
  await page.waitForTimeout(80);
  await page.evaluate(a => {
    const s = window.__smokeGame.scene.getScene('Room');
    window.__bushRenderB = new Uint8ClampedArray(window.__smokeGame.canvas.getContext('2d').getImageData(0, 0, window.__smokeGame.canvas.width, window.__smokeGame.canvas.height).data);
    s.player.setAlpha(1); s.world.bushes.foliage[a.index].setVisible(false);
  }, arena);
  await page.waitForTimeout(80);
  ok(await page.evaluate(a => {
    const s = window.__smokeGame.scene.getScene('Room'), canvas = window.__smokeGame.canvas;
    const c = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const x = window.__bushRenderA, y = window.__bushRenderB;
    const bush = s.world.bushes.foliage[a.index], frame = bush.frame, camera = s.cameras.main;
    const mask = document.createElement('canvas'); mask.width = frame.width; mask.height = frame.height;
    const ctx = mask.getContext('2d');
    ctx.drawImage(bush.texture.getSourceImage(), frame.cutX, frame.cutY, frame.width, frame.height, 0, 0, frame.width, frame.height);
    const alpha = ctx.getImageData(0, 0, frame.width, frame.height).data;
    const bounds = bush.getBounds();
    let covered = 0;
    for (let i = 0; i < c.length; i += 4) {
      const screenX = i / 4 % canvas.width, screenY = Math.floor(i / 4 / canvas.width);
      const px = Math.floor((camera.worldView.x + (screenX - camera.x) / camera.zoom - bounds.x) / bush.scaleX);
      const py = Math.floor((camera.worldView.y + (screenY - camera.y) / camera.zoom - bounds.y) / bush.scaleY);
      if (px < 0 || py < 0 || px >= frame.width || py >= frame.height || !alpha[(py * frame.width + px) * 4 + 3]) continue;
      if (x[i] === c[i] && x[i+1] === c[i+1] && x[i+2] === c[i+2] &&
        (x[i] !== y[i] || x[i+1] !== y[i+1] || x[i+2] !== y[i+2])) covered++;
    }
    s.world.bushes.foliage[a.index].setVisible(true);
    delete window.__bushRenderA; delete window.__bushRenderB;
    return covered > 100;
  }, arena), 'Проверка реального Canvas: более 100 пикселей друида видны поверх непрозрачной части куста');
  ok(await page.evaluate(async () => {
    const s = window.__smokeGame.scene.getScene('Room'), { isRunSave } = await import('/src/persistence/runSave.ts');
    const save = { version: 1, savedAt: Date.now(), characterId: 'druid', layout: structuredClone(s.layout),
      player: s.player.snapshot(), camera: { ...s.cameraFollow.center }, world: s.world.snapshot(), shots: s.acorns.snapshot() };
    const old = structuredClone(save); delete old.layout.bushes; delete old.layout.counts.bushes;delete old.world.bushTraps;
    const bad = structuredClone(save); bad.layout.bushes[0].variant = 8;
    const badCount = structuredClone(save); badCount.layout.counts.bushes++;
    const scattered = structuredClone(save); scattered.layout.bushes[0].x = save.layout.spawn.x; scattered.layout.bushes[0].y = save.layout.spawn.y;
    window.__scatteredBushSave = scattered;
    window.__bushMigrationBefore = { trees: JSON.stringify(save.layout.obstacles), logs: JSON.stringify(save.layout.logs), health: save.player.state.health };
    return isRunSave(save) && isRunSave(old) && isRunSave(scattered) && !isRunSave(bad) && !isRunSave(badCount);
  }), 'Сейв сохраняет виды и позиции кустов, принимает прежний мир без них и отвергает повреждённые данные');
  const previous = await page.evaluateHandle(() => {
    const s = window.__smokeGame.scene.getScene('Room'), player = s.player;
    s.scene.restart({ savedRun: window.__scatteredBushSave }); return player;
  });
  await page.waitForFunction(p => window.__smokeGame.scene.getScene('Room').player !== p, previous); await previous.dispose(); await waitScene('Room');
  ok(await page.evaluate(async () => {
    const s = window.__smokeGame.scene.getScene('Room'), before = window.__bushMigrationBefore;
    const { bushInSpawnRoom } = await import('/src/world/bushes.ts');
    const result = s.layout.bushes.every(b => bushInSpawnRoom(s.layout, b)) &&
      JSON.stringify(s.layout.obstacles) === before.trees &&
      JSON.stringify(s.layout.logs) === before.logs && s.playerHealth === before.health;
    delete window.__scatteredBushSave; delete window.__bushMigrationBefore; return result;
  }), 'Продолжение старого забега переносит разбросанные кусты в левую среднюю комнату, сохраняя деревья, грибы и HP');
  const old = await page.evaluateHandle(() => {
    const s = window.__smokeGame.scene.getScene('Room'), world = s.world; s.scene.restart({ seed: s.layout.seed }); return world;
  });
  await page.waitForFunction(w => window.__smokeGame.scene.getScene('Room').world !== w, old); await old.dispose(); await waitScene('Room');
}
