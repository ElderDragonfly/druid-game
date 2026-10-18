export async function testCampAtmosphere(page, ok, clickNamed, waitScene) {
  const before = await page.evaluate(async () => {
    const { CAMP_ATMOSPHERE: config, fireflyPosition } = await import('/src/data/campAtmosphere.ts');
    const game = window.__smokeGame, scene = game.scene.getScene('CharacterSelect');
    const hashFrame = (key, frameName) => {
      const texture = game.textures.get(key), frame = texture.get(frameName);
      const c = document.createElement('canvas'); c.width = frame.cutWidth; c.height = frame.cutHeight;
      const ctx = c.getContext('2d'); ctx.drawImage(texture.getSourceImage(), frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, c.width, c.height);
      let hash = 2166136261;
      for (const value of ctx.getImageData(0,0,c.width,c.height).data) hash = Math.imul(hash ^ value, 16777619);
      return hash >>> 0;
    };
    let drawnFrames = true, fixedSurroundings = true, smoothWater = true, protectedWaterEdges = true;
    const readImage = async path => {
      const image = new Image(); image.src = `/docs/art/${path}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image,0,0);
      return { canvas, context, data:context.getImageData(0,0,image.width,image.height).data };
    };
    for (const kind of ['fire','water']) {
      const folder = kind === 'fire' ? 'selection-camp-frames-v1' : 'selection-water-flow-v2';
      const read = name => readImage(`${folder}/${name}`);
      const expected = await read(`${kind}-frames.png`), reference = await read(`${kind}-reference.png`);
      const change = await read(`${kind}-change-mask.png`);
      const motion = await read(kind === 'fire' ? 'fire-motion-mask.png' : 'water-change-mask.png');
      const base = kind === 'fire' ? await read('fire-base.png') : reference;
      const previousMask = kind === 'water' ? await readImage('selection-camp-frames-v1/water-change-mask.png') : null;
      const texture = game.textures.get(`selection-${kind}-frames`), area = config[kind];
      const actual = document.createElement('canvas'); actual.width = expected.canvas.width; actual.height = expected.canvas.height;
      actual.getContext('2d').drawImage(texture.getSourceImage(),0,0);
      drawnFrames &&= actual.getContext('2d').getImageData(0,0,actual.width,actual.height).data.every((v,i)=>v===expected.data[i]);
      let previous, first;
      const gentle = (a,b) => a.every((v,i)=>Math.abs(v-b[i])<=8);
      for (let frameIndex=0;frameIndex<config[kind].frameCount;frameIndex++) {
        const frame = texture.get(String(frameIndex));
        const pixels = actual.getContext('2d').getImageData(frame.cutX,frame.cutY,area.width,area.height).data;
        for(let p=0;p<pixels.length;p+=4) for(let c=0;c<4;c++) {
          if(!motion.data[p]) fixedSurroundings &&= pixels[p+c]===base.data[p+c];
          if(!change.data[p]) fixedSurroundings &&= pixels[p+c]===reference.data[p+c];
        }
        if (kind === 'water') {
          if (previous) smoothWater &&= gentle(pixels,previous);
          else first = pixels;
          smoothWater &&= pixels.every((v,i)=>Math.abs(v-reference.data[i])<=20);
          previous = pixels;
        }
      }
      if (kind === 'water') {
        smoothWater &&= gentle(first,previous); // Includes the last-to-first seam.
        for (let y=1;y<area.height-1;y++) for(let x=1;x<area.width-1;x++) {
          if (!change.data[(y*area.width+x)*4]) continue;
          for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++)
            protectedWaterEdges &&= previousMask.data[((y+dy)*area.width+x+dx)*4]>0;
        }
      }
    }
    const fire = scene.children.getByName('camp-fire'), water = scene.children.getByName('camp-water');
    const flies = scene.children.list.filter(o => o.name.startsWith('camp-firefly-') && o.name !== 'camp-firefly-clean-layer');
    const loops = config.fireflies.every((f,i) => {
      const a = fireflyPosition(i, 317), b = fireflyPosition(i, 317 + f.periodMs);
      return Math.hypot(a.x-b.x,a.y-b.y) < 1e-7;
    });
    const body = scene.children.getByName('selected-character-preview'), staff = scene.children.getByName('selected-character-prop-0');
    const clean = scene.children.getByName('camp-firefly-clean-layer');
    const ctx = document.createElement('canvas').getContext('2d'); ctx.canvas.width = 960; ctx.canvas.height = 540;
    ctx.drawImage(game.textures.get('camp-firefly-clean').getSourceImage(),0,0);
    const cleanup = config.fireflies.every(f => {
      const pixel = ctx.getImageData(f.x,f.y,1,1).data;
      return pixel[3] === 255 && pixel[0] < 150 && pixel[1] < 150;
    });
    return { count: flies.length, loops, independent: new Set(config.fireflies.map(f=>f.periodMs)).size === 5,
      positions: flies.map(o=>({x:o.x,y:o.y})), fireFrame: fire.frame.name, waterFrame: water.frame.name,
      animatedPixels: hashFrame(fire.texture.key,'0') !== hashFrame(fire.texture.key,'7') && hashFrame(water.texture.key,'0') !== hashFrame(water.texture.key,'7'),
      filters: [fire,water,...flies].every(o=>o.texture.source[0].scaleMode === 1),
      actor: {x:body.x,y:body.y,texture:body.texture.key,staff:staff.texture.key},
      cleanup, cleanupAboveWater: scene.children.getIndex(clean) > scene.children.getIndex(water),
      panelAbove: scene.children.list.findIndex(o=>o.type==='Rectangle') > scene.children.getIndex(fire),
      fireFps: config.fire.fps, waterFps: config.water.fps, fireCount: config.fire.frameCount, waterCount: config.water.frameCount,
      drawnFrames, fixedSurroundings, smoothWater, protectedWaterEdges };
  });
  ok(before.count === 5 && before.loops && before.independent, 'Пять светлячков имеют независимые периоды и действительно замкнутые траектории');
  ok(before.animatedPixels && before.filters && before.fireFps === 10 / 3 && before.waterFps === 12 && before.fireCount === 8 && before.waterCount === 72 && before.drawnFrames,
    'Огонь замедлен втрое; вода имеет плавный шестисекундный цикл; готовые PNG проигрываются 1:1 с NEAREST');
  ok(before.fixedSurroundings, 'Камни, берега, лес и окружение вне масок движения побайтно неподвижны во всех кадрах');
  ok(before.smoothWater && before.protectedWaterEdges, 'Вода меняет оттенки плавно, включая стык цикла; сохранён защитный пиксель вдоль берегов и камней');
  ok(before.cleanup && before.cleanupAboveWater && before.panelAbove,
    'Старые статичные огоньки убраны, включая область воды; эффекты остаются позади панели интерфейса');
  await page.waitForTimeout(580);
  const after = await page.evaluate(() => {
    const s = window.__smokeGame.scene.getScene('CharacterSelect'), b = s.children.getByName('selected-character-preview');
    return { fireFrame:s.children.getByName('camp-fire').frame.name, waterFrame:s.children.getByName('camp-water').frame.name,
      positions:s.children.list.filter(o=>o.name.startsWith('camp-firefly-') && o.name!=='camp-firefly-clean-layer').map(o=>({x:o.x,y:o.y})),
      actor:{x:b.x,y:b.y,texture:b.texture.key,staff:s.children.getByName('selected-character-prop-0').texture.key} };
  });
  ok(after.fireFrame !== before.fireFrame && after.waterFrame !== before.waterFrame &&
    after.positions.every((p,i)=>Math.hypot(p.x-before.positions[i].x,p.y-before.positions[i].y) > .2),
    'В живой сцене сменяются кадры огня/воды и движется каждый светлячок');
  ok(JSON.stringify(after.actor) === JSON.stringify(before.actor), 'Атмосферные эффекты не меняют слой, размер или положение друида и посоха');
  await page.keyboard.press('Escape'); await waitScene('MainMenu');
  ok(await page.evaluate(() => {
    const g = window.__smokeGame;
    return ['selection-fire-frames','selection-water-frames','selection-firefly'].every(key=>!g.textures.exists(key)) &&
      !g.scene.getScene('MainMenu').children.getByName('camp-fire');
  }), 'Выход из выбора освобождает атласы эффектов; главное меню остаётся прежним');
  await clickNamed('MainMenu','play'); await waitScene('CharacterSelect');
  ok(await page.evaluate(() => {
    const s = window.__smokeGame.scene.getScene('CharacterSelect');
    return s.children.list.filter(o=>o.name==='camp-fire').length === 1 &&
      s.children.list.filter(o=>o.name.startsWith('camp-firefly-') && o.name!=='camp-firefly-clean-layer').length === 5;
  }), 'Повторный вход создаёт один костёр и пять светлячков без дублирования');
}
