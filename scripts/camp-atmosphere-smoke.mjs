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
    let drawnFrames = true, fixedSurroundings = true, smoothWater = true, protectedWaterEdges = true, visibleWaterPixels = 0, onlyFlameChanges = true, softFireJoin = true, softEdgeCount = 0, transparentBorders = true;
    const readImage = async path => {
      const image = new Image(); image.src = `/docs/art/${path}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image,0,0);
      return { canvas, context, data:context.getImageData(0,0,image.width,image.height).data };
    };
    for (const kind of ['fire','water']) {
      const folder = 'selection-camp-seam-v1';
      const read = name => readImage(`${folder}/${name}`);
      const expected = await read(`${kind}-frames.png`), reference = await read(`${kind}-reference.png`);
      const change = await readImage(kind==='water' ? 'selection-water-flow-v2/water-change-mask.png' : 'selection-camp-uploaded-flame-v1/fire-change-mask.png');
      const motion = kind==='water' ? change : await readImage('selection-camp-uploaded-flame-v1/fire-motion-mask.png');
      const base = kind === 'fire' ? await read('fire-base.png') : reference;
      if (kind === 'fire') {
        const acceptedBase=await readImage('selection-camp-frames-v1/fire-base.png');
        const original=await readImage('selection-camp-uploaded-flame-v1/fire-reference.png');
        const clean=await read('fire-clean-mask.png');
        // The static cleanup fades into the rock; the foreground coals are exact.
        onlyFlameChanges &&= base.data.every((v,i)=>Math.floor(i/4/128)>=125 ? v===acceptedBase.data[i] :
          clean.data[Math.floor(i/4)*4]>0 || v===original.data[i]);
        for(let i=0;i<base.data.length;i+=4) if(clean.data[i]>0&&clean.data[i]<32) {
          softEdgeCount++;
          for(let c=0;c<3;c++) softFireJoin&&=Math.abs(base.data[i+c]-original.data[i+c])<=Math.abs(acceptedBase.data[i+c]-original.data[i+c])*.15+1;
        }
      }
      const previousMask = kind === 'water' ? await readImage('selection-camp-frames-v1/water-change-mask.png') : null;
      const texture = game.textures.get(`selection-${kind}-frames`), area = config[kind];
      const actual = document.createElement('canvas'); actual.width = expected.canvas.width; actual.height = expected.canvas.height;
      const actualCtx=actual.getContext('2d');
      const raw=document.createElement('canvas');raw.width=actual.width;raw.height=actual.height;
      raw.getContext('2d').drawImage(texture.getSourceImage(),0,0);
      const rawPixels=raw.getContext('2d').getImageData(0,0,raw.width,raw.height).data;
      // Test final pixels over the common static background, while runtime uses
      // transparent effects only. Opaque rectangular scenery is never overlaid.
      for(let index=0;index<config[kind].frameCount;index++) {
        const x=index%area.framesPerRow*area.width,y=Math.floor(index/area.framesPerRow)*area.height;
        actualCtx.drawImage(base.canvas,0,0,area.width,area.height,x,y,area.width,area.height);
        actualCtx.drawImage(raw,x,y,area.width,area.height,x,y,area.width,area.height);
        for(let py=0;py<area.height;py++)for(let px=0;px<area.width;px++) {
          if(px<2||py<2||px>=area.width-2||py>=area.height-2)
            transparentBorders&&=rawPixels[((y+py)*raw.width+x+px)*4+3]===0;
        }
      }
      drawnFrames &&= actualCtx.getImageData(0,0,actual.width,actual.height).data.every((v,i)=>v===expected.data[i]);
      let previous, first, waterMin, waterMax;
      const gentle = (a,b) => a.every((v,i)=>Math.abs(v-b[i])<=16);
      for (let frameIndex=0;frameIndex<config[kind].frameCount;frameIndex++) {
        const frame = texture.get(String(frameIndex));
        const pixels = actual.getContext('2d').getImageData(frame.cutX,frame.cutY,area.width,area.height).data;
        for(let p=0;p<pixels.length;p+=4) for(let c=0;c<4;c++) {
          if(!motion.data[p]) fixedSurroundings &&= pixels[p+c]===base.data[p+c];
          if(!change.data[p]) fixedSurroundings &&= pixels[p+c]===reference.data[p+c];
        }
        if (kind === 'fire') for(let p=0;p<pixels.length;p+=4) {
          if (p/4>=125*area.width) for(let c=0;c<4;c++) onlyFlameChanges &&= pixels[p+c]===base.data[p+c];
          if ([0,1,2].some(c=>pixels[p+c]!==base.data[p+c]))
            onlyFlameChanges &&= pixels[p]>95 && pixels[p+1]>35 && pixels[p+2]<40 && pixels[p+3]===255;
        }
        if (kind === 'water') {
          if (!waterMin) { waterMin = pixels.slice(); waterMax = pixels.slice(); }
          else for (let i=0;i<pixels.length;i++) { waterMin[i]=Math.min(waterMin[i],pixels[i]); waterMax[i]=Math.max(waterMax[i],pixels[i]); }
          if (previous) smoothWater &&= gentle(pixels,previous);
          else first = pixels;
          smoothWater &&= pixels.every((v,i)=>Math.abs(v-reference.data[i])<=74);
          previous = pixels;
        }
      }
      if (kind === 'water') {
        smoothWater &&= gentle(first,previous); // Includes the last-to-first seam.
        // Count only the river above/to the right of the opaque menu panel.
        // Tiny invisible changes in hidden water no longer satisfy this check.
        for(let y=0;y<80;y++) for(let x=116;x<area.width;x++) {
          const p=(y*area.width+x)*4;
          if ([0,1,2].some(c=>waterMax[p+c]-waterMin[p+c]>=24)) visibleWaterPixels++;
        }
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
    const area = index => {
      const period=config.fireflies[index].periodMs;
      const points=Array.from({length:64},(_,i)=>fireflyPosition(index,i*period/64));
      return points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a.x*b.y-b.x*a.y;},0);
    };
    const oppositeFlight=area(3)>0 && area(4)>0 && area(5)<0;
    const body = scene.children.getByName('selected-character-preview'), staff = scene.children.getByName('selected-character-prop-0');
    const clean = scene.children.getByName('camp-firefly-clean-layer');
    const ctx = document.createElement('canvas').getContext('2d'); ctx.canvas.width = 960; ctx.canvas.height = 540;
    ctx.drawImage(game.textures.get('camp-firefly-clean').getSourceImage(),0,0);
    const cleanup = config.fireflies.slice(0,config.backgroundFireflyCount).every(f => {
      const pixel = ctx.getImageData(f.x,f.y,1,1).data;
      return pixel[3] === 255 && pixel[0] < 150 && pixel[1] < 150;
    });
    return { count: flies.length, loops, oppositeFlight, independent: new Set(config.fireflies.map(f=>f.periodMs)).size === 6,
      positions: flies.map(o=>({x:o.x,y:o.y})), fireFrame: fire.frame.name, waterFrame: water.frame.name,
      animatedPixels: hashFrame(fire.texture.key,'0') !== hashFrame(fire.texture.key,'7') && hashFrame(water.texture.key,'0') !== hashFrame(water.texture.key,'7'),
      filters: [fire,water,...flies].every(o=>o.texture.source[0].scaleMode === 1),
      actor: {x:body.x,y:body.y,texture:body.texture.key,staff:staff.texture.key},
      cleanup, cleanupAboveWater: scene.children.getIndex(clean) > scene.children.getIndex(water),
      panelAbove: scene.children.list.findIndex(o=>o.type==='Rectangle') > scene.children.getIndex(fire),
      fireFps: config.fire.fps, waterFps: config.water.fps, fireCount: config.fire.frameCount, waterCount: config.water.frameCount,
      drawnFrames, fixedSurroundings, smoothWater, protectedWaterEdges, visibleWaterPixels, onlyFlameChanges, softFireJoin, softEdgeCount, transparentBorders };
  });
  ok(before.count === 6 && before.loops && before.independent, 'Шесть светлячков имеют независимые периоды и действительно замкнутые траектории');
  ok(before.animatedPixels && before.filters && before.fireFps === 18.75 && before.waterFps === 24 && before.fireCount === 37 && before.waterCount === 144 && before.drawnFrames,
    'Все 37 кадров загруженного огня проигрываются при 18,75 FPS (на 25% медленнее); вода прежняя; готовые PNG используются 1:1 с NEAREST');
  ok(before.oppositeFlight, 'Новый огонёк справа летит против часовой стрелки, два прежних видимых огонька — по часовой');
  ok(before.onlyFlameChanges, 'Импортированное пламя сохранено: камни и угли прежние, фон GIF и чужие поленья отсутствуют');
  ok(before.transparentBorders,'Огонь и вода — прозрачные слои: двухпиксельная граница каждого кадра пуста, прямоугольный фон не перекрывается');
  ok(before.softFireJoin&&before.softEdgeCount>100,'Подложка костра плавно соединяется со скалой: на внешней границе убрано не менее 85% прежнего резкого перепада');
  ok(before.fixedSurroundings, 'Камни, берега, лес и окружение вне масок движения побайтно неподвижны во всех кадрах');
  ok(before.smoothWater && before.protectedWaterEdges, 'Вода меняет оттенки плавно, включая стык цикла; сохранён защитный пиксель вдоль берегов и камней');
  ok(before.visibleWaterPixels >= 500, 'Течение заметно в открытой части реки: не менее 500 пикселей меняют оттенок минимум на 24/255');
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
      s.children.list.filter(o=>o.name.startsWith('camp-firefly-') && o.name!=='camp-firefly-clean-layer').length === 6;
  }), 'Повторный вход создаёт один костёр и шесть светлячков без дублирования');
}
