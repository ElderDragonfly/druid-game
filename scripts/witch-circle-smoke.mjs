/** Grove layout, unchanged grass, held pickup, persistence and lifecycle. */
export async function testWitchCircle(page,ok,click,waitScene){
  const seed=await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').layout.seed);
  ok(await page.evaluate(async()=>{
    const {generateMeadow,obstacleVisualRect}=await import('/src/world/meadowLayout.ts');
    const {rectTouchesGroveClearing,treeInGroveCenter,generateWitchCircle,groveInterior}=await import('/src/world/witchGrove.ts');
    const {bushVisualRect}=await import('/src/world/bushes.ts'),{WITCH_CIRCLE:C}=await import('/src/data/witchCircle.ts');
    const {roomAt}=await import('/src/world/rooms.ts');
    const counts=new Set(),centers=new Set();let irregular=false;
    for(let seed=0;seed<200;seed++){
      const l=generateMeadow(seed),c=l.witchCircle,r=groveInterior(l);
      if(!c||JSON.stringify(c)!==JSON.stringify(generateWitchCircle(l))||c.version!==2||c.x-C.clearingRadiusX<r.x||c.y-C.clearingRadiusY<r.y||
        c.x+C.clearingRadiusX>r.x+r.width||c.y+C.clearingRadiusY>r.y+r.height)return false;
      if(c.mushrooms.length<12||c.mushrooms.length>16||new Set(c.mushrooms.map(m=>m.variant)).size!==9)return false;
      if(l.obstacles.some(t=>treeInGroveCenter(l,t)||rectTouchesGroveClearing(obstacleVisualRect(t),c))||
        l.bushes.some(b=>rectTouchesGroveClearing(bushVisualRect(b),c)))return false;
      const trees=l.obstacles.filter(t=>roomAt(l,t)===3);
      if(trees.some((t,i)=>trees.slice(0,i).some(u=>Math.hypot(t.x-u.x,t.y-u.y)<120-.01)))return false;
      const radii=c.mushrooms.map(m=>Math.hypot((m.x-c.x)/72,(m.y-c.y)/48));
      if(radii.some(d=>Math.abs(d-1)>.09))return false;
      irregular||=Math.max(...radii)-Math.min(...radii)>.04;
      counts.add(c.mushrooms.length);centers.add(`${c.x},${c.y}`);
    }
    return counts.size===5&&centers.size>195&&irregular&&C.radiusX*2===C.druidReferenceHeight*1.5&&C.radiusY/C.radiusX===2/3&&
      C.centralHeight===C.druidReferenceHeight*2/3&&C.clearingRadiusX===C.radiusX*4/3&&C.clearingRadiusY===C.radiusY*4/3;
  }),'200 seed: деревья на опушке, кусты в середине; деревья разнесены минимум на 120; овал 144×96, буфер 192×128, 12–16 грибов всех 9 видов');
  ok(await page.evaluate(async()=>{
    const {generateForestFloor,FOREST_FLOOR}=await import('/src/world/forestFloor.ts');
    const {forestFloorSamples}=await import('/src/rendering/forestFloor.ts');
    const s=window.__smokeGame.scene.getScene('Room'),actual=s.world.grass.raster;
    const expected=generateForestFloor(forestFloorSamples(s),actual.width,actual.height,s.layout.seed);
    const c=s.layout.witchCircle,scale=FOREST_FLOOR.pixelScale;
    let raisedBlades=0;
    for(let y=Math.floor((c.y-64)/scale);y<=Math.ceil((c.y+64)/scale);y++)
      for(let x=Math.floor((c.x-96)/scale);x<=Math.ceil((c.x+96)/scale);x++){
        const i=y*actual.width+x;
        if(actual.grassHeights[i]!==expected.grassHeights[i])return false;
        for(let channel=0;channel<4;channel++)if(actual.pixels[i*4+channel]!==expected.pixels[i*4+channel])return false;
        if(actual.grassHeights[i]>0)raisedBlades++;
      }
    return raisedBlades>100&&!s.textures.exists('witch-circle-soil');
  }),'Внутри и вокруг овала исходная трава и высота травинок сохранены без пятна почвы; текстура земли не загружается');
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),w=s.world.witchCircle;
    return w.ring.length===s.layout.witchCircle.mushrooms.length&&new Set(s.layout.witchCircle.mushrooms.map(m=>m.variant)).size===9&&
      !w.canInteract({x:w.position.x,y:w.position.y+50})&&w.canInteract({x:w.position.x+60,y:w.position.y})&&Math.abs(w.central.displayHeight-64)<.000001&&w.central.visible&&!w.collected&&
      [...w.ring,w.central].every(o=>!o.body&&o.cameraFilter&s.hudCamera.id&&o.texture.source[0].scaleMode===1)&&
      w.ring.every((m,i)=>Math.abs(m.displayHeight-s.layout.witchCircle.mushrooms[i].height)<.001)&&
      !s.world.obstacles.getChildren().some(o=>o.getData('kind')==='bush');
  }),'Кольцо проходимо, центральная полная композиция высотой 64; все спрайты без сглаживания/коллизий, кусты снова без физических тел');
  await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),c=s.layout.witchCircle;s.physics.pause();
    s.player.cancelCast();s.player.cancelHit();s.player.body.reset(c.x+110,c.y-10);s.player.body.updateFromGameObject();
    window.__witchCollected=0;s.events.on('witch-circle-collected',()=>window.__witchCollected++);
  });
  await page.keyboard.down('e');await page.waitForTimeout(1100);await page.keyboard.up('e');
  ok(await page.evaluate(()=>{const s=window.__smokeGame.scene.getScene('Room');return !s.world.witchCircle.collected&&!s.holdIndicator.visible;}),
    'Долгое E снаружи ведьминого круга не собирает центральный гриб');
  await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),c=s.layout.witchCircle;
    s.player.body.reset(c.x-45,c.y-10);s.player.body.updateFromGameObject();
  });
  await page.waitForTimeout(80);
  ok(await page.evaluate(()=>{const s=window.__smokeGame.scene.getScene('Room');return s.holdIndicator.visible&&s.world.witchCircle.canInteract(s.player.body.center);}),
    'После входа в круг появляется общая подсказка E; к центральному грибу не нужно подходить вплотную');
  await page.keyboard.down('e');await page.waitForTimeout(300);await page.keyboard.up('e');
  ok(await page.evaluate(()=>{const s=window.__smokeGame.scene.getScene('Room');return !s.world.witchCircle.collected&&s.world.witchCircle.central.visible;}),
    'Короткое удержание оставляет центральный гриб на месте');
  const before=await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),p=s.player,sound=s.pickupFeedback.sound;
    window.__pickupPlayed=0;const original=sound.play;
    sound.play=function(...args){window.__pickupPlayed++;return original.apply(this,args);};
    return {x:p.x,y:p.y,state:JSON.stringify(p.actorState)};
  });
  await page.keyboard.down('e');await page.keyboard.down('w');await page.keyboard.down('ArrowRight');await page.waitForTimeout(350);
  ok(await page.evaluate(p=>{const s=window.__smokeGame.scene.getScene('Room');return s.player.x===p.x&&s.player.y===p.y&&!s.player.casting.active&&s.holdInteraction.progress>0;},before),
    'Удержание E в круге заполняет индикатор и блокирует ходьбу и каст');
  await page.keyboard.up('w');await page.keyboard.up('ArrowRight');await page.waitForTimeout(850);await page.keyboard.up('e');
  ok(await page.evaluate(p=>{
    const s=window.__smokeGame.scene.getScene('Room'),w=s.world.witchCircle;
    return w.collected&&!w.central.visible&&w.ring.every(m=>m.visible)&&window.__witchCollected===1&&JSON.stringify(s.player.actorState)===p.state;
  },before),'Секунда E убирает только центральную композицию, сохраняет кольцо, HP и характеристики; событие ровно одно');
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),f=s.pickupFeedback;
    return f.active&&f.icon.visible&&f.shine.visible&&f.icon.texture.key==='pickup-mushroom'&&
      f.icon.y+f.icon.displayHeight/2<s.player.getTopLeft().y&&Math.abs(f.icon.x-s.player.x)<1&&
      !f.icon.body&&!!(f.icon.cameraFilter&s.hudCamera.id)&&!!(f.shine.cameraFilter&s.hudCamera.id)&&
      Math.abs(f.sound.duration-.32)<.01&&window.__pickupPlayed===1;
  }),'Подбор центрального гриба показывает правый гриб с сиянием над головой, без коллизии и дубликата HUD; пинг звучит один раз');
  await page.keyboard.down('e');await page.waitForTimeout(1100);await page.keyboard.up('e');
  ok(await page.evaluate(()=>{const f=window.__smokeGame.scene.getScene('Room').pickupFeedback;return window.__witchCollected===1&&!f.active&&!f.icon.visible&&!f.shine.visible&&window.__pickupPlayed===1;}),
    'Собранный центр не активируется повторно, гриб и сияние исчезают после короткого показа без повторного звука');
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),f=s.pickupFeedback;
    const preferences=f.preferences,enabled=preferences.enabled,volume=preferences.volume;
    preferences.enabled=false;f.play();const muted=window.__pickupPlayed===1;
    preferences.enabled=true;preferences.volume=.4;f.play();
    await new Promise(resolve=>setTimeout(resolve,50));
    const scaled=window.__pickupPlayed===2&&Math.abs(f.sound.volume-.22)<.001;
    preferences.enabled=enabled;preferences.volume=volume;f.update(1100);delete window.__pickupPlayed;
    return muted&&scaled;
  }),'Пинг учитывает выключатель звука и громкость; эффект не меняет здоровье или награду');
  await page.keyboard.press('Escape');await waitScene('MainMenu');
  ok(await page.evaluate(async()=>{
    const {loadRun,isRunSave}=await import('/src/persistence/runSave.ts'),save=loadRun();
    if(!save?.world.witchCircle?.collected||!isRunSave(save))return false;
    const bad=structuredClone(save);bad.world.witchCircle.collected='yes';
    const sprite=structuredClone(save);sprite.layout.witchCircle.mushrooms[0].variant=9;
    const legacy=structuredClone(save),c=legacy.layout.witchCircle;delete c.version;
    c.mushrooms.forEach((m,i)=>{const a=Math.atan2((m.y-c.y)/48,(m.x-c.x)/72);m.x=Math.round(c.x+Math.cos(a)*72);m.y=Math.round(c.y+Math.sin(a)*72);m.variant=i%4;});
    window.__legacyCircleRun=legacy;
    const old=structuredClone(save);delete old.layout.witchCircle;delete old.world.witchCircle;delete old.world.bushTraps;
    old.layout.obstacles[0].x=640;old.layout.obstacles[0].y=1080;
    window.__legacyWitchRun=old;
    return !isRunSave(bad)&&!isRunSave(sprite)&&isRunSave(old)&&isRunSave(legacy);
  }),'Сейв хранит круг и сбор центра, отвергает повреждённые флаги/кадры и принимает прежние забеги без круга');
  await click('MainMenu','continue-run');await waitScene('Room');
  ok(await page.evaluate(()=>{const s=window.__smokeGame.scene.getScene('Room'),w=s.world.witchCircle;return w.collected&&!w.central.visible&&w.ring.length===s.layout.witchCircle.mushrooms.length&&!s.pickupFeedback.active;}),
    'Продолжение забега не возвращает уже собранный гриб');
  const circlePlayer=await page.evaluateHandle(()=>{const s=window.__smokeGame.scene.getScene('Room'),p=s.player;s.scene.restart({savedRun:window.__legacyCircleRun});return p;});
  await page.waitForFunction(p=>window.__smokeGame.scene.getScene('Room').player!==p,circlePlayer);await circlePlayer.dispose();await waitScene('Room');
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room');delete window.__legacyCircleRun;
    return s.layout.witchCircle.version===2&&s.world.witchCircle.collected&&!s.world.witchCircle.central.visible&&new Set(s.layout.witchCircle.mushrooms.map(m=>m.variant)).size===9;
  }),'Старое круглое кольцо преобразуется в новый овал с 9 видами, уже собранный центр не возвращается');
  const legacyPlayer=await page.evaluateHandle(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),p=s.player;s.scene.restart({savedRun:window.__legacyWitchRun});return p;
  });
  await page.waitForFunction(p=>window.__smokeGame.scene.getScene('Room').player!==p,legacyPlayer);await legacyPlayer.dispose();await waitScene('Room');
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),old=window.__legacyWitchRun;
    const {treeInGroveCenter,rectTouchesGroveClearing}=await import('/src/world/witchGrove.ts');
    const {obstacleVisualRect}=await import('/src/world/meadowLayout.ts');
    const result=!!s.layout.witchCircle&&!s.world.witchCircle.collected&&
      s.layout.obstacles.length===old.layout.counts.trees&&s.playerHealth===old.player.state.health&&
      s.layout.obstacles.every(t=>!treeInGroveCenter(s.layout,t)&&!rectTouchesGroveClearing(obstacleVisualRect(t),s.layout.witchCircle))&&
      !s.physics.overlap(s.player,s.world.obstacles);
    delete window.__legacyWitchRun;return result;
  }),'Прежний забег без круга получает новую поляну: дерево из середины перенесено к краю, количество деревьев и HP сохранены');
  const previous=await page.evaluateHandle(seed=>{const s=window.__smokeGame.scene.getScene('Room'),old=s.world.witchCircle;s.scene.restart({seed});return old;},seed);
  await page.waitForFunction(old=>window.__smokeGame.scene.getScene('Room').world.witchCircle!==old,previous);await waitScene('Room');
  ok(await page.evaluate(old=>{const w=window.__smokeGame.scene.getScene('Room').world.witchCircle;return !w.collected&&w.central.visible&&!old.central.scene&&old.ring.every(m=>!m.scene);},previous),
    'Новая локация возвращает центр и удаляет прежние изображения без дубликатов');
  await previous.dispose();
}
