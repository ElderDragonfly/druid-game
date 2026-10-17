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
    const s = window.__smokeGame.scene.getScene('Room');
    const result = [];
    for (const direction of ['left', 'right']) {
      const texture = s.textures.get(`druid-hit-${direction}`);
      const maskImage = new Image(); maskImage.src = `/docs/art/druid-hit-side-v1/boot-mask-${direction}.png`; await maskImage.decode();
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 320;
      const c = canvas.getContext('2d'); c.drawImage(maskImage, 0, 0);
      const mask = c.getImageData(0, 0, 256, 320).data;
      const idleTexture = s.textures.get(direction === 'left' ? 'druid-left-source' : 'druid-right-source');
      c.clearRect(0, 0, 256, 320); c.drawImage(idleTexture.getSourceImage(), 0, 0);
      const idle = c.getImageData(0, 0, 256, 320).data;
      let stable = true, endpoints = true, changed = 0, alpha = true;
      for (let index = 0; index < 5; index++) {
        const frame = texture.get(String(index));
        c.clearRect(0, 0, 256, 320);
        c.drawImage(texture.getSourceImage(), frame.cutX + 128, 40, 256, 320, 0, 0, 256, 320);
        const pixels = c.getImageData(0, 0, 256, 320).data;
        for (let p = 0; p < pixels.length; p += 4) {
          alpha &&= pixels[p + 3] === 0 || pixels[p + 3] === 255;
          if (mask[p] && (pixels[p] !== idle[p] || pixels[p + 1] !== idle[p + 1] || pixels[p + 2] !== idle[p + 2] || pixels[p + 3] !== idle[p + 3])) stable = false;
        }
        if (index === 0 || index === 4) endpoints &&= pixels.every((v, p) => v === idle[p]);
        if (index === 2) changed = pixels.reduce((n, v, p) => n + Number(v !== idle[p]), 0);
      }
      result.push(stable && endpoints && alpha && changed > 2000 && texture.source[0].scaleMode === 1);
    }
    return result.length === DRUID_HIT_ART.length && result.every(Boolean);
  });
  ok(art, 'Обе реакции: пять кадров 1:1, NEAREST, исходные стойки на концах и неподвижные сапоги');

  for (const direction of ['left', 'right']) {
    const previous = await page.evaluateHandle(direction => {
      const s = window.__smokeGame.scene.getScene('Room'), old = s.player;
      s.scene.restart({ seed: 0 }); return old;
    }, direction);
    await page.waitForFunction(old => {
      const s = window.__smokeGame.scene.getScene('Room'); return s.player !== old && s.world?.wolf?.body;
    }, previous); await previous.dispose();
    const setup = await page.evaluate(direction => {
      const s = window.__smokeGame.scene.getScene('Room'), p = s.player, w = s.world.wolf;
      w.setActive(false).setVelocity(0, 0); w.body.enable = false;
      p.actorState.facing = direction; p.updateAppearance(true);
      const result = { x: p.x, y: p.y, health: s.playerHealth, width: p.body.width, height: p.body.height };
      p.updateCasting(0, direction); p.receiveHit();
      return result;
    }, direction);
    await page.keyboard.down(direction === 'left' ? 'a' : 'd');
    await page.keyboard.down(direction === 'left' ? 'ArrowLeft' : 'ArrowRight');
    await page.waitForTimeout(130);
    const during = await page.evaluate(() => {
      const s = window.__smokeGame.scene.getScene('Room'), p = s.player;
      return { active: p.hitReaction.active, cast: p.casting.active, bodyVisible: p.visible,
        castVisible: p.castVisual.visible, hitVisible: p.hitVisual.visible, frame: p.hitVisual.frame.name,
        x: p.x, y: p.y, health: s.playerHealth, width: p.body.width, height: p.body.height,
        filter: !!(p.hitVisual.cameraFilter & s.cameras.getCamera('hud').id),
        depth: p.hitVisual.depth === p.depth, sync: p.hitVisual.x === p.x && p.hitVisual.y === p.y };
    });
    ok(during.active && !during.cast && !during.bodyVisible && !during.castVisible && during.hitVisible &&
      during.frame !== '0' && during.filter && during.depth && during.sync &&
      during.x === setup.x && during.y === setup.y && during.health === setup.health &&
      during.width === setup.width && during.height === setup.height,
      `Попадание ${direction}: единственный визуальный слой, каст и движение прерваны, HP/позиция/коллайдер прежние`);
    await page.keyboard.up(direction === 'left' ? 'ArrowLeft' : 'ArrowRight');
    await page.waitForFunction(() => !window.__smokeGame.scene.getScene('Room').player.hitReaction.active);
    await page.waitForTimeout(100);
    const resumed = await page.evaluate(() => {
      const p = window.__smokeGame.scene.getScene('Room').player;
      return { visible: p.visible, hitVisible: p.hitVisual.visible, speed: Math.hypot(p.body.velocity.x, p.body.velocity.y) };
    });
    await page.keyboard.up(direction === 'left' ? 'a' : 'd');
    ok(resumed.visible && !resumed.hitVisible && resumed.speed > 100, `После ${direction}-реакции удерживаемая WASD снова двигает друида`);
  }

  // Real wolf attack, observed at its active frame, rather than manually calling receiveHit.
  await page.evaluate(() => {
    const s = window.__smokeGame.scene.getScene('Room'), p = s.player, w = s.world.wolf;
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
    return o.count === 1 && o.late && s.playerHealth === o.health;
  }), 'Атака настоящего волка запускает одну реакцию на активном кадре, без потери HP');
  await page.evaluate(() => {
    const s = window.__smokeGame.scene.getScene('Room');
    s.player.cancelHit(); s.player.body.reset(s.layout.spawn.x + 600, s.layout.spawn.y);
  });
  await page.waitForFunction(() => window.__smokeGame.scene.getScene('Room').world.wolf.actorState.phase === 'chase');
  await page.evaluate(() => {
    const s = window.__smokeGame.scene.getScene('Room'), x = s.layout.spawn.x, y = s.layout.spawn.y + 22.5;
    s.player.body.reset(x, y - 22.5); s.world.wolf.body.reset(x + 40, y);
  });
  await page.waitForFunction(() => {
    const w = window.__smokeGame.scene.getScene('Room').world.wolf;
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
    const p = s.player, w = s.world.wolf;
    p.cancelHit(); p.cancelCast(); p.actorState.facing = 'up'; p.updateAppearance(true); p.receiveHit();
    window.__fallbackHit = { active: p.hitReaction.active, facing: p.actorState.facing,
      visible: p.visible, hitVisible: p.hitVisual.visible };
    w.setActive(false).setVelocity(0, 0); w.body.enable = false;
  });
  ok(await page.evaluate(() => {
    const f = window.__fallbackHit; return f.active && f.facing === 'up' && f.visible && !f.hitVisible;
  }), 'Ненарисованный ракурс сохраняет свою стойку и короткую паузу, без разворота вбок');
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
