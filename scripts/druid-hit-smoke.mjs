import { isolateSingleWolf } from './wolf-fixture.mjs';
/** Hit reactions: independent clock, sprite integrity and actual wolf impact. */
export async function testDruidHits(page, ok) {
  const timer = await page.evaluate(async () => {
    const { DruidHitReaction, HIT_DURATION } = await import('/src/behavior/DruidHitReaction.ts');
    const reaction = new DruidHitReaction();
    reaction.start('left'); reaction.update(120);
    const frame = reaction.frameIndex, ignored = !reaction.start('right') && reaction.facing === 'left' && reaction.frameIndex === frame;
    reaction.update(HIT_DURATION - 121); const beforeEnd = reaction.active;
    reaction.update(1); const ended = !reaction.active;
    reaction.start('right'); reaction.update(-100); const noReverse = reaction.frameIndex === 0;
    reaction.cancel();
    return ignored && beforeEnd && ended && noReverse && !reaction.active && HIT_DURATION === 400;
  });
  ok(timer, 'Реакция длится 400 мс, не перезапускается попаданиями внутри жеста и имеет независимый таймер');
  const art = await page.evaluate(async () => {
    const { DRUID_HIT_ART } = await import('/src/rendering/druidHitArt.ts');
    const { DRUID_VIEWS } = await import('/src/rendering/druidArt.ts');
    const { FACINGS } = await import('/src/input/EightWayFacing.ts');
    const s = window.__smokeGame.scene.getScene('Room');
    const result = [];
    for (const direction of FACINGS) {
      const texture = s.textures.get(`druid-hit-${direction}`);
      const maskImage = new Image(); maskImage.src = `/docs/art/${['left', 'right'].includes(direction) ? 'druid-hit-side-v1' : 'druid-hit-eight-way-v1'}/boot-mask-${direction}.png`; await maskImage.decode();
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 320;
      const c = canvas.getContext('2d'); c.drawImage(maskImage, 0, 0);
      const mask = c.getImageData(0, 0, 256, 320).data;
      const idleTexture = s.textures.get(DRUID_VIEWS.find(view => view.direction === direction).sourceKey);
      c.clearRect(0, 0, 256, 320); c.drawImage(idleTexture.getSourceImage(), 0, 0);
      const idle = c.getImageData(0, 0, 256, 320).data;
      let originalHit, tunicMask;
      if (direction === 'left') {
        originalHit = new Image(); originalHit.src = '/docs/art/druid-hit-side-v1/hit-left-512x384.png';
        tunicMask = new Image(); tunicMask.src = '/docs/art/druid-left-tunic-v1/hit-left-tunic-mask.png';
        await Promise.all([originalHit.decode(), tunicMask.decode()]);
      }
      let stable = true, endpoints = true, changed = 0, alpha = true;
      for (let index = 0; index < 5; index++) {
        const frame = texture.get(String(index));
        c.clearRect(0, 0, 256, 320);
        c.drawImage(texture.getSourceImage(), frame.cutX + 128, 40, 256, 320, 0, 0, 256, 320);
        const pixels = c.getImageData(0, 0, 256, 320).data;
        if (originalHit) {
          c.clearRect(0, 0, 256, 320);
          c.drawImage(originalHit, index * 512 + 128, 40, 256, 320, 0, 0, 256, 320);
          const previous = c.getImageData(0, 0, 256, 320).data;
          c.clearRect(0, 0, 256, 320);
          c.drawImage(tunicMask, index * 512 + 128, 40, 256, 320, 0, 0, 256, 320);
          const allowed = c.getImageData(0, 0, 256, 320).data;
          for (let p=0;p<pixels.length;p+=4) {
            stable &&= pixels[p+3] === previous[p+3];
            if (!allowed[p]) for(let channel=0;channel<3;channel++) stable &&= pixels[p+channel] === previous[p+channel];
          }
        }
        for (let p = 0; p < pixels.length; p += 4) {
          alpha &&= pixels[p + 3] === 0 || pixels[p + 3] === 255;
          if (mask[p] && (pixels[p] !== idle[p] || pixels[p + 1] !== idle[p + 1] || pixels[p + 2] !== idle[p + 2] || pixels[p + 3] !== idle[p + 3])) stable = false;
        }
        if (!['left', 'right'].includes(direction)) stable &&= pixels.slice(246 * 256 * 4).every((v, p) => v === idle[246 * 256 * 4 + p]);
        if (index === 0 || index === 4) endpoints &&= pixels.every((v, p) => v === idle[p]);
        if (index === 2) changed = pixels.reduce((n, v, p) => n + Number(v !== idle[p]), 0);
      }
      result.push(stable && endpoints && alpha && changed > 2000 && texture.source[0].scaleMode === 1);
    }
    return result.length === 8 && result.length === DRUID_HIT_ART.length && result.every(Boolean);
  });
  ok(art, 'Все восемь реакций: пять кадров 1:1, NEAREST, исходные стойки на концах и неподвижные сапоги');

  const { FACINGS } = await page.evaluate(async () => ({ FACINGS: (await import('/src/input/EightWayFacing.ts')).FACINGS }));
  const moves = { left: ['a'], right: ['d'], up: ['w'], down: ['s'],
    'up-left': ['w', 'a'], 'up-right': ['w', 'd'], 'down-left': ['s', 'a'], 'down-right': ['s', 'd'] };
  const arrows = { a: 'ArrowLeft', d: 'ArrowRight', w: 'ArrowUp', s: 'ArrowDown' };
  for (const direction of FACINGS) {
    const previous = await page.evaluateHandle(direction => {
      const s = window.__smokeGame.scene.getScene('Room'), old = s.player;
      s.scene.restart({ seed: 0 }); return old;
    }, direction);
    await page.waitForFunction(old => {
      const s = window.__smokeGame.scene.getScene('Room'); return s.player !== old && s.world?.wolves?.[0]?.body;
    }, previous); await previous.dispose();await isolateSingleWolf(page);
    const setup = await page.evaluate(direction => {
      const s = window.__smokeGame.scene.getScene('Room'), p = s.player, w = s.world.wolves[0];
      w.setActive(false).setVelocity(0, 0); w.body.enable = false;
      p.actorState.facing = direction; p.updateAppearance(true);
      const result = { x: p.x, y: p.y, health: s.playerHealth, width: p.body.width, height: p.body.height };
      p.updateCasting(0, direction); p.receiveHit();
      return result;
    }, direction);
    for (const key of moves[direction]) await page.keyboard.down(key);
    for (const key of moves[direction]) await page.keyboard.down(arrows[key]);
    await page.waitForTimeout(130);
    const during = await page.evaluate(() => {
      const s = window.__smokeGame.scene.getScene('Room'), p = s.player;
      return { active: p.hitReaction.active, cast: p.casting.active, bodyVisible: p.visible,
        castVisible: p.castVisual.visible, hitVisible: p.hitVisual.visible, frame: p.hitVisual.frame.name, texture: p.hitVisual.texture.key, facing: p.actorState.facing,
        x: p.x, y: p.y, health: s.playerHealth, width: p.body.width, height: p.body.height,
        filter: !!(p.hitVisual.cameraFilter & s.cameras.getCamera('hud').id),
        depth: p.hitVisual.depth === p.depth, sync: p.hitVisual.x === p.x && p.hitVisual.y === p.y };
    });
    ok(during.active && !during.cast && !during.bodyVisible && !during.castVisible && during.hitVisible &&
      during.texture === `druid-hit-${direction}` && during.facing === direction && during.frame !== '0' && during.filter && during.depth && during.sync &&
      during.x === setup.x && during.y === setup.y && during.health === setup.health &&
      during.width === setup.width && during.height === setup.height,
      `Попадание ${direction}: единственный визуальный слой, каст и движение прерваны, HP/позиция/коллайдер прежние`);
    for (const key of moves[direction]) await page.keyboard.up(arrows[key]);
    await page.waitForFunction(() => !window.__smokeGame.scene.getScene('Room').player.hitReaction.active);
    await page.waitForTimeout(100);
    const resumed = await page.evaluate(() => {
      const p = window.__smokeGame.scene.getScene('Room').player;
      return { visible: p.visible, hitVisible: p.hitVisual.visible, speed: Math.hypot(p.body.velocity.x, p.body.velocity.y) };
    });
    for (const key of moves[direction]) await page.keyboard.up(key);
    ok(resumed.visible && !resumed.hitVisible && resumed.speed > 100, `После ${direction}-реакции удерживаемая WASD снова двигает друида`);
  }

  // Real wolf attack, observed at its active frame, rather than manually calling receiveHit.
  await page.evaluate(() => {
    const s = window.__smokeGame.scene.getScene('Room'), p = s.player, w = s.world.wolves[0];
    p.cancelHit(); p.cancelCast(); p.actorState.facing = 'right'; p.updateAppearance(true);
    const x = s.layout.spawn.x, y = s.layout.spawn.y + 22.5;
    p.body.reset(x, y - 22.5);
    w.setActive(true); w.body.enable = true; w.body.reset(x + 40, y);
    window.__hitObservation = { count: 0, late: false, oldHit: false, health: s.playerHealth };
    const observe = () => {
      const o = window.__hitObservation;
      if (p.hitReaction.active && !o.oldHit) {
        o.count++; o.late = w.actorState.phase === 'attack' && w.actorState.elapsed >= 240 && w.actorState.elapsed < 300;
      }
      o.oldHit = p.hitReaction.active;
    };
    s.events.on('postupdate', observe); window.__hitObserver = observe;
  });
  await page.waitForFunction(() => window.__hitObservation.count >= 1);
  await page.waitForTimeout(410);
  ok(await page.evaluate(() => {
    const s = window.__smokeGame.scene.getScene('Room'), o = window.__hitObservation;
    return o.count === 1 && o.late && s.playerHealth === o.health - 1;
  }), 'Атака настоящего волка запускает одну реакцию на активном кадре и снимает 1 HP');
  await page.evaluate(() => {
    const s = window.__smokeGame.scene.getScene('Room');
    s.player.cancelHit(); s.player.body.reset(s.layout.spawn.x + 600, s.layout.spawn.y);
  });
  await page.waitForFunction(() => window.__smokeGame.scene.getScene('Room').world.wolves[0].actorState.phase === 'chase');
  await page.evaluate(() => {
    const s = window.__smokeGame.scene.getScene('Room'), x = s.layout.spawn.x, y = s.layout.spawn.y + 22.5;
    s.player.body.reset(x, y - 22.5); s.world.wolves[0].body.reset(x + 40, y);
  });
  await page.waitForFunction(() => {
    const w = window.__smokeGame.scene.getScene('Room').world.wolves[0];
    return w.actorState.phase === 'attack' && w.actorState.elapsed < 180;
  });
  const beforeMiss = await page.evaluate(() => {
    const s = window.__smokeGame.scene.getScene('Room');
    s.player.body.reset(s.layout.spawn.x - 250, s.layout.spawn.y);
    return window.__hitObservation.count;
  });
  await page.waitForTimeout(330);
  ok(await page.evaluate(count => !window.__smokeGame.scene.getScene('Room').player.hitReaction.active && window.__hitObservation.count === count, beforeMiss),
    'Уход до активного кадра атаки не вызывает ложного попадания');
  await page.evaluate(() => {
    const s = window.__smokeGame.scene.getScene('Room'); s.events.off('postupdate', window.__hitObserver);
    const p = s.player, w = s.world.wolves[0];
    p.cancelHit(); p.cancelCast(); p.actorState.facing = 'up'; p.updateAppearance(true); p.receiveHit();
    window.__upHit = { active: p.hitReaction.active, facing: p.actorState.facing,
      visible: p.visible, hitVisible: p.hitVisual.visible };
    w.setActive(false).setVelocity(0, 0); w.body.enable = false;
  });
  ok(await page.evaluate(() => {
    const f = window.__upHit; return f.active && f.facing === 'up' && !f.visible && f.hitVisible;
  }), 'Реакция вверх использует собственную анимацию без разворота вбок');
  await page.waitForTimeout(420);
  const oldPlayer = await page.evaluateHandle(() => {
    const s = window.__smokeGame.scene.getScene('Room'), old = s.player;
    s.scene.restart({ seed: 0 }); return old;
  });
  await page.waitForFunction(old => window.__smokeGame.scene.getScene('Room').player !== old, oldPlayer);
  ok(await page.evaluate(old => !old.hitVisual.scene && !window.__smokeGame.scene.getScene('Room').player.hitReaction.active, oldPlayer),
    'Перезапуск удаляет старый слой реакции и сбрасывает попадание');
  await oldPlayer.dispose();
}
