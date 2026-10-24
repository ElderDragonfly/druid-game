/** Grove layout, bare ground, held pickup, persistence and lifecycle. */
export async function testWitchCircle(page,ok,click,waitScene){
  const seed=await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').layout.seed);
  ok(await page.evaluate(async()=>{
    const {generateMeadow,obstacleVisualRect}=await import('/src/world/meadowLayout.ts');
    const {rectTouchesCircle,treeInGroveCenter,generateWitchCircle,groveInterior}=await import('/src/world/witchGrove.ts');
    const {bushVisualRect}=await import('/src/world/bushes.ts'),{WITCH_CIRCLE:C}=await import('/src/data/witchCircle.ts');
    const counts=new Set(),centers=new Set();let irregular=false;
    for(let seed=0;seed<200;seed++){
      const l=generateMeadow(seed),c=l.witchCircle,r=groveInterior(l);
      if(!c||JSON.stringify(c)!==JSON.stringify(generateWitchCircle(l))||c.x-C.clearingRadius<r.x||c.y-C.clearingRadius<r.y||
        c.x+C.clearingRadius>r.x+r.width||c.y+C.clearingRadius>r.y+r.height)return false;
      if(c.mushrooms.length<12||c.mushrooms.length>16||new Set(c.mushrooms.map(m=>m.variant)).size!==4)return false;
      if(l.obstacles.some(t=>treeInGroveCenter(l,t)||rectTouchesCircle(obstacleVisualRect(t),c,C.clearingRadius))||
        l.bushes.some(b=>rectTouchesCircle(bushVisualRect(b),c,C.clearingRadius)))return false;
      const radii=c.mushrooms.map(m=>Math.hypot(m.x-c.x,m.y-c.y));
      if(radii.some(d=>Math.abs(d-72)>6))return false;
      irregular||=Math.max(...radii)-Math.min(...radii)>4;
      counts.add(c.mushrooms.length);centers.add(`${c.x},${c.y}`);
    }
    return counts.size===5&&centers.size>195&&irregular&&C.radius*2===C.druidReferenceHeight*1.5&&
      C.centralHeight===C.druidReferenceHeight*2/3&&C.clearingRadius===C.radius*4/3;
  }),'200 seed: деревья на опушке, кусты в середине; круг 144, буфер 192 без деревьев/кустов, 12–16 неровно расставленных мухоморов всех 4 видов');
  ok(await page.evaluate(async()=>{
    const {paintWitchCircleSoil}=await import('/src/rendering/witchCircleSoil.ts');
    const make=()=>({width:220,height:220,pixels:new Uint8ClampedArray(220*220*4),grassHeights:new Uint8Array(220*220).fill(12)});
    const a=make(),b=make();for(let i=0;i<a.pixels.length;i+=4){a.pixels.set([40,90,45,255],i);b.pixels.set([40,90,45,255],i);}
    const c={x:110,y:110,mushrooms:[]};paintWitchCircleSoil(a,c,1,17);paintWitchCircleSoil(b,c,1,17);
    if(a.pixels.some((v,i)=>v!==b.pixels[i]))return false;
    for(let y=0;y<220;y++)for(let x=0;x<220;x++){
      const p=y*220+x,inside=Math.hypot(x+.5-110,y+.5-110)<=72;
      if(inside?(a.grassHeights[p]!==0||a.pixels[p*4]<a.pixels[p*4+1]):
        (a.grassHeights[p]!==12||a.pixels[p*4]!==40||a.pixels[p*4+1]!==90))return false;
    }
    const s=window.__smokeGame.scene.getScene('Room'),circle=s.layout.witchCircle,r=s.world.grass.raster;
    const p=Math.floor(circle.y/1.25)*r.width+Math.floor(circle.x/1.25);
    return r.grassHeights[p]===0&&r.pixels[p*4]>=r.pixels[p*4+1];
  }),'Голая земля внутри окружности: нет травы/цветов и перекрытия сапог, окружающая трава побайтно сохранена');
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),w=s.world.witchCircle;
    return w.ring.length===s.layout.witchCircle.mushrooms.length&&Math.abs(w.central.displayHeight-64)<.000001&&w.central.visible&&!w.collected&&
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
  const before=await page.evaluate(()=>{const p=window.__smokeGame.scene.getScene('Room').player;return {x:p.x,y:p.y,state:JSON.stringify(p.actorState)};});
  await page.keyboard.down('e');await page.keyboard.down('w');await page.keyboard.down('ArrowRight');await page.waitForTimeout(350);
  ok(await page.evaluate(p=>{const s=window.__smokeGame.scene.getScene('Room');return s.player.x===p.x&&s.player.y===p.y&&!s.player.casting.active&&s.holdInteraction.progress>0;},before),
    'Удержание E в круге заполняет индикатор и блокирует ходьбу и каст');
  await page.keyboard.up('w');await page.keyboard.up('ArrowRight');await page.waitForTimeout(850);await page.keyboard.up('e');
  ok(await page.evaluate(p=>{
    const s=window.__smokeGame.scene.getScene('Room'),w=s.world.witchCircle;
    return w.collected&&!w.central.visible&&w.ring.every(m=>m.visible)&&window.__witchCollected===1&&JSON.stringify(s.player.actorState)===p.state;
  },before),'Секунда E убирает только центральную композицию, сохраняет кольцо, HP и характеристики; событие ровно одно');
  await page.keyboard.down('e');await page.waitForTimeout(1100);await page.keyboard.up('e');
  ok(await page.evaluate(()=>window.__witchCollected===1),'Собранный центр не активируется повторно');
  await page.keyboard.press('Escape');await waitScene('MainMenu');
  ok(await page.evaluate(async()=>{
    const {loadRun,isRunSave}=await import('/src/persistence/runSave.ts'),save=loadRun();
    if(!save?.world.witchCircle?.collected||!isRunSave(save))return false;
    const bad=structuredClone(save);bad.world.witchCircle.collected='yes';
    const sprite=structuredClone(save);sprite.layout.witchCircle.mushrooms[0].variant=4;
    const old=structuredClone(save);delete old.layout.witchCircle;delete old.world.witchCircle;
    old.layout.obstacles[0].x=640;old.layout.obstacles[0].y=1080;
    window.__legacyWitchRun=old;
    return !isRunSave(bad)&&!isRunSave(sprite)&&isRunSave(old);
  }),'Сейв хранит круг и сбор центра, отвергает повреждённые флаги/кадры и принимает прежние забеги без круга');
  await click('MainMenu','continue-run');await waitScene('Room');
  ok(await page.evaluate(()=>{const s=window.__smokeGame.scene.getScene('Room'),w=s.world.witchCircle;return w.collected&&!w.central.visible&&w.ring.length===s.layout.witchCircle.mushrooms.length;}),
    'Продолжение забега не возвращает уже собранный гриб');
  const legacyPlayer=await page.evaluateHandle(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),p=s.player;s.scene.restart({savedRun:window.__legacyWitchRun});return p;
  });
  await page.waitForFunction(p=>window.__smokeGame.scene.getScene('Room').player!==p,legacyPlayer);await legacyPlayer.dispose();await waitScene('Room');
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),old=window.__legacyWitchRun;
    const {treeInGroveCenter,rectTouchesCircle}=await import('/src/world/witchGrove.ts');
    const {obstacleVisualRect}=await import('/src/world/meadowLayout.ts');
    const result=!!s.layout.witchCircle&&!s.world.witchCircle.collected&&
      s.layout.obstacles.length===old.layout.counts.trees&&s.playerHealth===old.player.state.health&&
      s.layout.obstacles.every(t=>!treeInGroveCenter(s.layout,t)&&!rectTouchesCircle(obstacleVisualRect(t),s.layout.witchCircle,96))&&
      !s.physics.overlap(s.player,s.world.obstacles);
    delete window.__legacyWitchRun;return result;
  }),'Прежний забег без круга получает новую поляну: дерево из середины перенесено к краю, количество деревьев и HP сохранены');
  const previous=await page.evaluateHandle(seed=>{const s=window.__smokeGame.scene.getScene('Room'),old=s.world.witchCircle;s.scene.restart({seed});return old;},seed);
  await page.waitForFunction(old=>window.__smokeGame.scene.getScene('Room').world.witchCircle!==old,previous);await waitScene('Room');
  ok(await page.evaluate(old=>{const w=window.__smokeGame.scene.getScene('Room').world.witchCircle;return !w.collected&&w.central.visible&&!old.central.scene&&old.ring.every(m=>!m.scene);},previous),
    'Новая локация возвращает центр и удаляет прежние изображения без дубликатов');
  await previous.dispose();
}
