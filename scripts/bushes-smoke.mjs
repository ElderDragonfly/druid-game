/** Solid bush bases, shared navigation, actor visibility and saved runs. */
export async function testBushes(page, ok, waitScene) {
  ok(await page.evaluate(async () => {
    const { generateMeadow, obstacleRect, overlaps } = await import('/src/world/meadowLayout.ts');
    const { bushVisualRect, generateBushes } = await import('/src/world/bushes.ts');
    const { stumpClearing } = await import('/src/world/stump.ts');
    const { ritualTreeClearing, roomBounds } = await import('/src/world/rooms.ts');
    const { logVisualRect } = await import('/src/world/fallenLogs.ts');
    const variants = new Set(), counts = new Set();
    for (let seed = 0; seed < 200; seed++) {
      const l = generateMeadow(seed), bushes = l.bushes;
      if (bushes.length < 24 || bushes.length > 36 || bushes.length >= l.counts.trees ||
        l.counts.bushes !== bushes.length || JSON.stringify(bushes) !== JSON.stringify(generateBushes(l))) return false;
      counts.add(bushes.length);
      const room = roomBounds(l, 3);
      const reserved = [stumpClearing(l.stump), ...l.obstacles.map(obstacleRect),
        ...l.logs.map(logVisualRect), ...l.rooms.flatMap(r => r.tree ? [ritualTreeClearing(r.tree)] : []),
        { x: l.spawn.x - 80, y: l.spawn.y - 100, width: 160, height: 180 }];
      for (const [i, b] of bushes.entries()) {
        variants.add(b.variant); const r = bushVisualRect(b);
        if (r.x < room.x + 12 || r.y < room.y + 12 || r.x + r.width > room.x + room.width - 12 || r.y + r.height > room.y + room.height - 12 ||
          reserved.some(a => overlaps(r, a, 18)) || bushes.slice(0, i).some(a => overlaps(r, bushVisualRect(a), 18))) return false;
      }
    }
    return variants.size === 8 && counts.size === 13;
  }), '200 seed: все 24–36 кустов из 8 видов целиком в левой средней комнате; отступ от границ 12, от стволов и соседних кустов 18');
  ok(await page.evaluate(() => {
    const s = window.__smokeGame.scene.getScene('Room'), b = s.world.bushes;
    return b.foliage.length === s.layout.bushes.length &&
      b.foliage.every(o => !o.body && o.cameraFilter & s.hudCamera.id && o.texture.source[0].scaleMode === 1 &&
        Math.abs(o.displayWidth - o.width * 7 / 12) < 1e-6 && Math.abs(o.displayHeight - o.height * 7 / 12) < 1e-6) &&
      !s.textures.exists('forest-bush-ground') && !s.children.list.some(o => o.name.startsWith('bush-ground-'));
  }), 'Все кусты увеличены на 75% до масштаба 7/12, остаются без подложек, сглаживания и дубликатов HUD');
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),{bushCollisionRect,bushVisualRect}=await import('/src/world/bushes.ts');
    const {layoutCollisionRects}=await import('/src/world/collision.ts'),{mouseCanStand}=await import('/src/behavior/MouseWander.ts');
    const {WolfNavigation}=await import('/src/world/WolfNavigation.ts');
    const nav=new WolfNavigation(s.layout);
    return s.layout.bushes.every((b,i)=>{
      const r=bushCollisionRect(b),v=bushVisualRect(b),proxy=s.children.getByName(`bush-collider-${i}`),body=proxy.body;
      const inside=layoutCollisionRects(s.layout).some(c=>JSON.stringify(c)===JSON.stringify(r));
      return inside&&!proxy.visible&&proxy.getData('kind')==='bush'&&body.enable&&
        Math.abs(body.x-r.x)<.01&&Math.abs(body.y-r.y)<.01&&Math.abs(body.width-r.width)<.01&&Math.abs(body.height-r.height)<.01&&
        r.x>=v.x&&r.y>=v.y&&r.x+r.width<=v.x+v.width&&r.y+r.height<=v.y+v.height&&
        !nav.canStand({x:r.x+r.width/2,y:r.y+r.height})&&!mouseCanStand(s.layout,{x:r.x+r.width/2,y:r.y+r.height});
    });
  }),'Каждый куст имеет одну коллизию у основания; физика, навигация волка и свободные места мышей используют тот же прямоугольник');
  const arena = await page.evaluate(async () => {
    const s = window.__smokeGame.scene.getScene('Room'); s.physics.pause();
    const { bushCollisionRect } = await import('/src/world/bushes.ts');
    const { WolfNavigation } = await import('/src/world/WolfNavigation.ts');
    const nav = new WolfNavigation(s.layout, { width: 20, height: 25 });
    const offset = s.player.body.bottom - s.player.y;
    for (const [index, b] of s.layout.bushes.entries()) {
      const r = bushCollisionRect(b), y = r.y+r.height/2+12.5;
      const starts=[{x:r.x-40,y},{x:r.x+r.width+40,y},{x:r.x+r.width/2,y:r.y-40},{x:r.x+r.width/2,y:r.y+r.height+65}];
      const {WOLF}=await import('/src/data/wolf.ts'),wolfNav=new WolfNavigation(s.layout,WOLF.body);
      const wolfStart={x:r.x-100,y:r.y+r.height/2+WOLF.body.height/2},goal={x:r.x+r.width+150,y:wolfStart.y};
      if (r.x<200||!starts.every(p=>nav.canStand(p))||!wolfNav.canStand(wolfStart)||!wolfNav.canStand(goal)||!wolfNav.route(wolfStart,goal).length) continue;
      s.player.cancelCast(); s.player.cancelHit(); return { index, r, starts, offset, wolfStart, goal };
    }
    throw new Error('Нет свободного куста для проверки прохода');
  });
  for(const [i,key] of ['d','a','s','w'].entries()){
    await page.evaluate(({a,i})=>{
      const s=window.__smokeGame.scene.getScene('Room');s.physics.pause();
      s.player.body.reset(a.starts[i].x,a.starts[i].y-a.offset);s.player.body.updateFromGameObject();s.physics.resume();
    },{a:arena,i});
    await page.keyboard.down(key);await page.waitForTimeout(550);await page.keyboard.up(key);
    ok(await page.evaluate(({a,i})=>{
      const s=window.__smokeGame.scene.getScene('Room'),b=s.player.body,r=a.r;s.physics.pause();
      return Math.abs([b.right-r.x,b.x-r.x-r.width,b.bottom-r.y,b.y-r.y-r.height][i])<1;
    },{a:arena,i}),`Куст останавливает реальную WASD ${key.toUpperCase()} у основания без невидимого выступа`);
  }
  await page.evaluate(a=>{
    const s=window.__smokeGame.scene.getScene('Room'),w=s.world.wolves[0];
    window.__bushWolfOriginal=w.snapshot();w.setActive(true).setVisible(true);w.body.enable=true;
    const saved=w.snapshot();Object.assign(saved,{x:a.wolfStart.x,y:a.wolfStart.y,hitElapsed:null});
    Object.assign(saved.state,{phase:'chase',alerted:true,elapsed:0});w.restore(saved);
    s.player.body.reset(a.goal.x,a.goal.y-a.offset);s.player.body.updateFromGameObject();s.physics.resume();
  },arena);
  await page.waitForFunction(a=>window.__smokeGame.scene.getScene('Room').world.wolves[0].x>a.r.x+a.r.width+60,arena,{timeout:15000});
  ok(await page.evaluate(a=>{
    const s=window.__smokeGame.scene.getScene('Room'),w=s.world.wolves[0];s.physics.pause();
    const passed=w.x>a.r.x+a.r.width+60;
    w.restore(window.__bushWolfOriginal);w.setActive(false).setVisible(false).setVelocity(0,0);w.body.enable=false;w.shadow.setVisible(false);
    delete window.__bushWolfOriginal;return passed;
  },arena),'Волк обходит настоящий куст и продолжает погоню, не застревая у его коллизии');
  ok(await page.evaluate(async a=>{
    const s=window.__smokeGame.scene.getScene('Room'),{AcornProjectile}=await import('/src/entities/AcornProjectile.ts'),r=a.r;
    const shot=new AcornProjectile(s,s.player,r.x-30,r.y+r.height/2,{x:1,y:0});s.acorns.shots.push(shot);
    shot.body.reset(r.x+r.width+30,r.y+r.height/2);shot.body.updateFromGameObject();s.acorns.update(0);
    return !shot.scene;
  },arena),'Жёлудь исчезает при пересечении коллизии куста, включая пролёт между кадрами');
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
    const old = structuredClone(save); delete old.layout.bushes; delete old.layout.counts.bushes;
    const bad = structuredClone(save); bad.layout.bushes[0].variant = 8;
    const badCount = structuredClone(save); badCount.layout.counts.bushes++;
    const scattered = structuredClone(save); scattered.layout.bushes[0].x = save.layout.spawn.x; scattered.layout.bushes[0].y = save.layout.spawn.y;
    const edge = structuredClone(save), {BUSHES,BUSH_SIZE_MULTIPLIER}=await import('/src/data/bushes.ts');
    const art=BUSHES[edge.layout.bushes[0].variant];edge.layout.bushes[0].x=art.anchorX*art.scale/BUSH_SIZE_MULTIPLIER+1;
    window.__scatteredBushSave = scattered;
    window.__bushMigrationBefore = { trees: JSON.stringify(save.layout.obstacles), logs: JSON.stringify(save.layout.logs), health: save.player.state.health };
    return isRunSave(save) && isRunSave(old) && isRunSave(scattered) && isRunSave(edge) && !isRunSave(bad) && !isRunSave(badCount);
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
      !s.physics.overlap(s.player,s.world.obstacles) &&
      JSON.stringify(s.layout.obstacles) === before.trees &&
      JSON.stringify(s.layout.logs) === before.logs && s.playerHealth === before.health;
    delete window.__scatteredBushSave; delete window.__bushMigrationBefore; return result;
  }), 'Продолжение старого забега переносит разбросанные кусты в левую среднюю комнату, сохраняя деревья, грибы и HP');
  const old = await page.evaluateHandle(() => {
    const s = window.__smokeGame.scene.getScene('Room'), world = s.world; s.scene.restart({ seed: s.layout.seed }); return world;
  });
  await page.waitForFunction(w => window.__smokeGame.scene.getScene('Room').world !== w, old); await old.dispose(); await waitScene('Room');
}
