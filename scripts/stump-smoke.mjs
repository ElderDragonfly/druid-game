/** Start-view placement, shared collision, real held E and persistent activation. */
export async function testStump(page,ok,click,waitScene) {
  const placement=await page.evaluate(async()=>{
    const {generateMeadow,obstacleVisualRect,overlaps}=await import('/src/world/meadowLayout.ts');
    const {stumpClearing,stumpVisualRect}=await import('/src/world/stump.ts');
    const points=new Set();let safe=true,visible=true,repeatable=true;
    for(let seed=0;seed<1000;seed++) {
      const l=generateMeadow(seed),p=l.stump,v=stumpVisualRect(p),c=stumpClearing(p);
      points.add(`${p.x}:${p.y}`);
      visible&&=Math.hypot((p.x-l.spawn.x)/360,(p.y-l.spawn.y)/160)<=1&&
        Math.hypot(p.x-l.spawn.x,p.y-l.spawn.y)>=150&&
        v.x>=l.spawn.x-640&&v.y>=l.spawn.y-360&&v.x+v.width<=l.spawn.x+640&&v.y+v.height<=l.spawn.y+360;
      safe&&=l.obstacles.every(o=>!overlaps(obstacleVisualRect(o),c,8));
      if(seed<5)repeatable&&=JSON.stringify(p)===JSON.stringify(generateMeadow(seed).stump);
    }
    return {safe,visible,repeatable,variety:points.size};
  });
  ok(placement.safe&&placement.visible&&placement.repeatable&&placement.variety>990,
    '1000 локаций: один случайный пень на стартовом экране, без близких деревьев/крон, seed воспроизводится');
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),p=s.layout.stump;
    const {stumpRect}=await import('/src/world/stump.ts');
    const {WolfNavigation}=await import('/src/world/WolfNavigation.ts');
    const {mouseCanStand}=await import('/src/behavior/MouseWander.ts');
    const bounds=stumpRect(p),proxy=s.children.getByName('ritual-stump-collider'),image=s.children.getByName('ritual-stump');
    return s.children.list.filter(o=>o.name==='ritual-stump').length===1&&image.texture.key==='ritual-stump'&&
      image.texture.source[0].scaleMode===1&&proxy.body.enable&&!proxy.visible&&
      Math.abs(proxy.body.x-bounds.x)<.001&&Math.abs(proxy.body.y-bounds.y)<.001&&
      proxy.body.width===bounds.width&&proxy.body.height===bounds.height&&
      !new WolfNavigation(s.layout).canStand(p)&&!mouseCanStand(s.layout,p)&&
      [image,s.children.getByName('ritual-stump-ring'),s.children.getByName('ritual-stump-key')].every(o=>o.cameraFilter&s.hudCamera.id);
  }),'Пень — отдельный спрайт с коллизией для друида/волка/мыши; HUD-камера не дублирует рисунок и кольцо');
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),p=s.children.getByName('ritual-stump-collider').body;
    const {AcornProjectile}=await import('/src/entities/AcornProjectile.ts');
    const shot=new AcornProjectile(s,s.player,p.x-20,p.center.y,{x:1,y:0});
    s.acorns.shots.push(shot);shot.body.reset(p.right+20,p.center.y);shot.body.updateFromGameObject();s.acorns.update(0);
    return !shot.scene;
  }),'Жёлудь сталкивается с древесиной пня и исчезает');
  const seed=await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room');s.physics.pause();return s.layout.seed;
  });
  await page.keyboard.down('e');await page.waitForTimeout(1100);await page.keyboard.up('e');
  ok(await page.evaluate(()=>{const r=window.__smokeGame.scene.getScene('Room').world.ritual;return !r.activated&&r.progress===0;}),
    'Удержание E вдали не активирует пень');
  const near=await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),p=s.layout.stump;
    const {STUMP}=await import('/src/data/stump.ts');
    const c={x:p.x+STUMP.bodyWidth/2+25,y:p.y-STUMP.bodyHeight/2};
    s.player.body.reset(c.x,c.y-10);s.player.body.updateFromGameObject();
    window.__stumpActivations=0;window.__stumpListener=()=>window.__stumpActivations++;
    s.events.on('stump-activated',window.__stumpListener);
    window.__wolfAlertBefore=s.world.wolves.map(w=>w.actorState.alerted);
    return {x:c.x,y:c.y,clear:!s.physics.overlap(s.player,s.world.obstacles),inRange:s.world.ritual.canInteract(s.player.body.center)};
  });
  ok(near.clear&&near.inRange,'Для E достаточно подойти на 25 единиц от древесины; вплотную к коллизии прижиматься не нужно');
  await page.keyboard.down('e');await page.waitForTimeout(280);
  ok(await page.evaluate(()=>{const s=window.__smokeGame.scene.getScene('Room');return !s.world.ritual.activated&&s.world.ritual.progress>0&&s.world.ritual.progress<1&&s.children.getByName('ritual-stump-key').visible;}),
    'При удержании заполняется кольцо, короткого нажатия недостаточно');
  await page.keyboard.up('e');await page.waitForTimeout(60);
  ok(await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').world.ritual.progress===0),'Отпускание E сбрасывает неполный прогресс');
  await page.keyboard.down('e');await page.waitForTimeout(230);
  await page.evaluate(()=>{const s=window.__smokeGame.scene.getScene('Room');s.player.body.reset(s.layout.spawn.x,s.layout.spawn.y);});
  await page.waitForTimeout(80);await page.keyboard.up('e');
  ok(await page.evaluate(()=>{const r=window.__smokeGame.scene.getScene('Room').world.ritual;return !r.activated&&r.progress===0;}),'Отход от пня прерывает удержание');
  await page.evaluate(c=>{const s=window.__smokeGame.scene.getScene('Room');s.player.body.reset(c.x,c.y-10);s.player.body.updateFromGameObject();},near);
  await page.keyboard.down('e');await page.waitForTimeout(230);
  await page.keyboard.down('ArrowDown');await page.waitForTimeout(80);await page.keyboard.up('ArrowDown');await page.keyboard.up('e');
  ok(await page.evaluate(()=>{const s=window.__smokeGame.scene.getScene('Room');return s.player.casting.active&&!s.world.ritual.activated&&s.world.ritual.progress===0;}),'Каст прерывает начатое удержание пня');
  await page.waitForFunction(()=>!window.__smokeGame.scene.getScene('Room').player.casting.active);
  await page.keyboard.down('e');await page.waitForTimeout(200);
  await page.evaluate(()=>window.__smokeGame.events.emit('blur'));await page.waitForTimeout(60);await page.keyboard.up('e');
  ok(await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').world.ritual.progress===0),'Потеря фокуса сбрасывает удержание');
  await page.evaluate(()=>window.__smokeGame.events.emit('focus'));
  await page.keyboard.down('e');
  await page.waitForFunction(()=>window.__smokeGame.scene.getScene('Room').world.ritual.activated);
  await page.keyboard.up('e');
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room');
    return s.world.ritual.progress===1&&window.__stumpActivations===1&&
      s.children.getByName('ritual-stump-glow').alpha>0&&!s.children.getByName('ritual-stump-key').visible&&
      JSON.stringify(s.world.wolves.map(w=>w.actorState.alerted))===JSON.stringify(window.__wolfAlertBefore);
  }),'Полная секунда включает свечение и одно событие; волки не проклинаются и не получают принудительный агр');
  await page.keyboard.down('e');await page.waitForTimeout(1100);await page.keyboard.up('e');
  ok(await page.evaluate(()=>window.__stumpActivations===1),'Активированный пень не запускается повторно');
  await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').events.off('stump-activated',window.__stumpListener));
  await page.keyboard.press('Escape');await waitScene('MainMenu');
  ok(await page.evaluate(async()=>{
    const {loadRun,isRunSave}=await import('/src/persistence/runSave.ts');const saved=loadRun();
    if(!saved?.world.stump?.activated)return false;
    const legacy=structuredClone(saved);delete legacy.layout.stump;delete legacy.world.stump;
    const bad=structuredClone(saved);bad.world.stump.activated='yes';
    const outside=structuredClone(saved);outside.layout.stump.x=-1;
    return isRunSave(legacy)&&!isRunSave(bad)&&!isRunSave(outside);
  }),'Сейв сохраняет активацию; старые забеги без пня совместимы, некорректное состояние отклоняется');
  await click('MainMenu','continue-run');await waitScene('Room');
  ok(await page.evaluate(()=>{const s=window.__smokeGame.scene.getScene('Room');return s.world.ritual.activated&&s.children.getByName('ritual-stump-glow').alpha>0;}),'После «Продолжить» пень остаётся активным и светится');
  const previous=await page.evaluateHandle(()=>window.__smokeGame.scene.getScene('Room').world.ritual.image);
  await page.keyboard.press('r');await waitScene('Room');
  await page.waitForFunction(old=>window.__smokeGame.scene.getScene('Room').world.ritual.image!==old,previous);
  ok(await page.evaluate(old=>{
    const s=window.__smokeGame.scene.getScene('Room');
    return !old.scene&&!s.world.ritual.activated&&s.children.list.filter(o=>o.name==='ritual-stump').length===1;
  },previous),'R удаляет старый слой и создаёт один неактивный пень новой локации');
  await previous.dispose();
  const old=await page.evaluateHandle(seed=>{const s=window.__smokeGame.scene.getScene('Room'),p=s.player;s.scene.restart({seed});return p;},seed);
  await page.waitForFunction(p=>{const s=window.__smokeGame.scene.getScene('Room');return s.player!==p&&s.world?.layout===s.layout;},old);
  await old.dispose();await waitScene('Room');
}
