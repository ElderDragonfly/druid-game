/** Real projectiles, chain coordination, low leaps, persistence and deferred art. */
export async function testSproutRoom(page,ok,click,waitScene){
  ok(await page.evaluate(async()=>{
    const {generateMeadow}=await import('/src/world/meadowLayout.ts');
    const {roomAt}=await import('/src/world/rooms.ts');
    const {boneRect}=await import('/src/world/skeletonRoom.ts');
    const {overlaps}=await import('/src/world/geometry.ts');
    for(let seed=0;seed<200;seed++){
      const l=generateMeadow(seed),a=l.sproutRoom,rocks=l.bones.filter(b=>b.kind==='rock');
      if(l.rooms[1].scenario!=='sprouts'||a.enemies.length!==6||new Set(a.enemies.map(e=>e.variant)).size!==4||
        a.bushes.length<24||a.bushes.length>36||[...a.enemies,...a.bushes].some(p=>roomAt(l,p)!==1)||
        rocks.length!==Math.floor(l.bones.length/3)||rocks.length<8||rocks.length>12||
        l.bones.some((p,i)=>l.bones.slice(0,i).some(q=>overlaps(boneRect(p),boneRect(q),20)))||
        JSON.stringify(l.sproutRoom)!==JSON.stringify(generateMeadow(seed).sproutRoom))return false;
    }
    return true;
  }),'200 seed: шесть ростков всех четырёх видов, 24–36 кустов сверху по центру; 8–12 камней заменяют треть костей без наложений');
  const previous=await page.evaluateHandle(()=>{const s=window.__smokeGame.scene.getScene('Room'),p=s.player;s.scene.restart({seed:0});return p;});
  await page.waitForFunction(p=>window.__smokeGame.scene.getScene('Room').player!==p,previous);await previous.dispose();await waitScene('Room');
  await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room');s.physics.pause();
    s.world.sprouts.enemies.forEach(e=>{e.setActive(true);e.body.enable=true;e.drawPose();});
  });
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),c=s.world.sprouts;
    const raster=s.world.grass.raster,idx=(x,y)=>(Math.floor(y/1.25)*raster.width+Math.floor(x/1.25))*4;
    const center=idx(640,360),forest=idx(1900,360);
    return c.enemies.every(e=>e.actorState.phase==='buried'&&e.actorState.health===1&&e.body.width===26&&e.body.height===16&&
      e.image.texture.key.startsWith('sprout-plant-')&&(e.image.cameraFilter&s.hudCamera.id)&&s.world.enemyCollisions.group.contains(e))&&
      c.bushes.foliage.length===s.layout.sproutRoom.bushes.length&&c.bushes.foliage.every(b=>!b.body)&&
      s.layout.obstacles.some(t=>t.x>=1280&&t.x<2560&&t.y<720)&&
      raster.pixels[center]>raster.pixels[center+1]&&raster.pixels[forest+1]>raster.pixels[forest];
  }),'Из земли видны растения, у ростков общая физика и отдельный HUD-фильтр; деревья в комнате оставлены, прогалина скелетов имеет земляную подстилку');
  const shoot=()=>page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),e=s.world.sprouts.enemies[0],b=e.body;
    const {AcornProjectile}=await import('/src/entities/AcornProjectile.ts');
    const shot=new AcornProjectile(s,s.player,b.x-12,b.center.y,{x:1,y:0});s.acorns.shots.push(shot);
    shot.body.reset(b.right+12,b.center.y);shot.body.updateFromGameObject();s.acorns.update(0);
    return {hp:e.actorState.health,phase:e.actorState.phase,shots:s.acorns.shots.length};
  });
  const first=await shoot();
  ok(first.hp===1&&first.phase==='emerging'&&first.shots===0,'Первый настоящий жёлудь только будит закопанного ростка, поглощается и не снимает 1 HP');
  const second=await shoot();ok(second.hp===1&&second.phase==='emerging','Во время выхода из земли повторное попадание не убивает ростка');
  await page.keyboard.press('Escape');await waitScene('MainMenu');
  ok(await page.evaluate(async()=>{
    const {loadRun,isRunSave}=await import('/src/persistence/runSave.ts');const v=loadRun();if(!v||!isRunSave(v)||v.world.sprouts.released)return false;
    const bad=structuredClone(v);bad.world.sprouts.enemies[0].state.health=0;
    const other=structuredClone(v);other.world.sprouts.released=true;
    const missing=structuredClone(v);delete missing.world.sprouts;
    const old=structuredClone(v);delete old.world.sprouts;delete old.layout.sproutRoom;old.layout.rooms[1].scenario='empty';
    return !isRunSave(bad)&&!isRunSave(other)&&!isRunSave(missing)&&isRunSave(old);
  }),'Сейв хранит частичное пробуждение, отвергает несовместимые фазы/HP/отсутствующую группу и принимает старую пустую комнату');
  await click('MainMenu','continue-run');await waitScene('Room');
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),c=s.world.sprouts;s.physics.pause();s.player.body.enable=false;
    for(const e of c.enemies){e.setActive(true);e.body.enable=!e.dying;}
    let premature=false,maximum=0,awakenings=0;
    for(let i=0;i<5000&&!c.released;i++){
      const old=c.enemies.filter(e=>e.actorState.phase==='buried').length;c.update(16);
      if(!c.released&&c.enemies.some(e=>['chase','windup','leap'].includes(e.actorState.phase)))premature=true;
      maximum=Math.max(maximum,c.enemies.filter(e=>['seeking','waking'].includes(e.actorState.phase)).length);
      awakenings+=old-c.enemies.filter(e=>e.actorState.phase==='buried').length;
      for(const b of s.physics.world.bodies.entries)if(b.enable){b.resetFlags();b.preUpdate(false,.016);}
      s.physics.world.step(.016);s.physics.world.postUpdate();
    }
    window.__sproutChain={released:c.released,premature,maximum,awakenings,phases:c.enemies.map(e=>e.actorState.phase)};
    return c.released&&!premature&&maximum===1&&awakenings===5&&c.enemies.every(e=>e.emerged&&e.actorState.health===1);
  }),'Реальная физика после продолжения: пять соседей пробуждены последовательно, один посыльный за раз, атаки начинаются только после выхода всей шестёрки');
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),c=s.world.sprouts,e=c.enemies[0],p=s.player;
    c.enemies.slice(1).forEach(e=>e.takeDamage(1));
    e.body.reset(500,300);e.body.updateFromGameObject();e.navigator.invalidate();
    p.body.enable=true;p.body.reset(570,300-22.5);p.body.updateFromGameObject();p.cancelCast();p.cancelHit();p.actorState.health=3;
    e.enter('windup');e.step(350,true);
    let high=0;
    for(let i=0;i<25;i++){
      c.update(16);high=Math.max(high,e.body.bottom-e.image.y);
      for(const b of s.physics.world.bodies.entries)if(b.enable){b.resetFlags();b.preUpdate(false,.016);}
      s.physics.world.step(.016);s.physics.world.postUpdate();
    }
    return p.actorState.health===2&&e.actorState.attackConnected&&high>12&&Math.abs(e.body.bottom-300)<.01&&
      e.body.right<=p.wolfContactBounds.x+.1;
  }),'Низкий прыжок поднимает только рисунок, телесная коллизия сохраняется; атака наносит ровно 1 HP без пересечения друида');
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),e=s.world.sprouts.enemies[0];
    const killed=e.takeDamage(1);e.step(300,true);
    s.player.cancelHit();s.player.heal(1);
    return killed&&e.dying&&!e.body.enable&&!e.image.visible&&!e.takeDamage(1);
  }),'После выхода следующее попадание убивает ростка: он исчезает и освобождает коллизию');
  await page.keyboard.press('Escape');await waitScene('MainMenu');await click('MainMenu','continue-run');await waitScene('Room');
  ok(await page.evaluate(()=>{const c=window.__smokeGame.scene.getScene('Room').world.sprouts;return c.released&&c.enemies.length===6&&c.enemies.every(e=>e.dying&&!e.body.enable);}),
    'Продолжение сохраняет гибель всей группы без повторного появления');
}
