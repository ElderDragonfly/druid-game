/** Regressions for touching obstacles, corner routing and real physical recoil. */
export async function testInsectNavigationAndHit(page,ok,waitScene) {
  const seed=await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').layout.seed);
  const contacts=await page.evaluate(async()=>{
    const {generateMeadow}=await import('/src/world/meadowLayout.ts');
    const {layoutCollisionRects}=await import('/src/world/collision.ts');
    const {WolfNavigation}=await import('/src/world/WolfNavigation.ts');
    const {InsectFlight}=await import('/src/behavior/InsectFlight.ts');
    const l=generateMeadow(0),nav=new WolfNavigation(l,{width:32,height:18});let cases=0;const failed=[];
    // Include every chunk of a rotated log and the ritual tree, as well as trunks.
    for(const r of layoutCollisionRects(l).filter((_,i)=>i<6||i>=l.obstacles.length)) {
      const cy=r.y+r.height/2+9,cx=r.x+r.width/2;
      for(const [name,start,goal] of [
        ['left',{x:r.x-16,y:cy},{x:r.x+r.width+100,y:cy}],
        ['right',{x:r.x+r.width+16,y:cy},{x:r.x-100,y:cy}],
        ['top',{x:cx,y:r.y},{x:cx,y:r.y+r.height+110}],
        ['bottom',{x:cx,y:r.y+r.height+18},{x:cx,y:r.y-100}],
      ]) {
        if(!nav.canStand(start,-.01)||!nav.canStand(goal))continue;
        const ai=new InsectFlight(nav,start,1);ai.alert();let p={...start},reached=false,safe=true;
        for(let t=0;t<15000;t+=20) {
          const v=ai.step(20,p,goal,{x:goal.x-10,y:goal.y-18,width:20,height:18});
          p={x:p.x+v.x*.02,y:p.y+v.y*.02};safe&&=nav.canStand(p,-.05);
          if(ai.actorState.phase==='attack'){reached=true;break;}
        }
        cases++;if(!safe||!reached)failed.push({name,start,goal,p,safe,reached});
      }
    }
    return {cases,failed};
  });
  ok(contacts.cases>=24&&!contacts.failed.length,`Мухи выбираются из контакта со всех сторон стволов, брёвен и ритуального дерева: ${contacts.cases} маршрутов (${JSON.stringify(contacts.failed)})`);
  const setup=await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room');s.physics.pause();
    s.world.cleansing.tree.completeInteraction();
    const all=[...s.world.wolves,...s.world.mice,...s.world.cleansing.enemies];
    all.forEach(e=>{e.body.enable=false;e.setVelocity(0,0);});
    const e=s.world.cleansing.enemies[0];e.behavior.restoreFlight();e.body.enable=true;e.actorState.health=2;e.actorState.phase='chase';e.behavior.alert();
    s.player.takeDamage=()=>false;s.player.cancelCast();s.player.cancelHit();
    const {obstacleRect}=await import('/src/world/meadowLayout.ts'),nav=e.behavior.navigation;
    for(const o of s.layout.obstacles) {
      const r=obstacleRect(o),start={x:r.x-16,y:r.y+r.height/2+9},goal={x:r.x+r.width+100,y:start.y};
      if(!nav.canStand(start,-.01)||!nav.canStand(goal)||!nav.routeFromContact(start,goal).length)continue;
      const offset=s.player.body.bottom-s.player.y;
      s.player.body.reset(goal.x,goal.y-offset);s.player.body.updateFromGameObject();
      e.body.reset(start.x,start.y);e.body.updateFromGameObject();e.behavior.navigator.invalidate();
      s.physics.resume();return {r,start,goal};
    }
    throw new Error('Нет дерева для физического обхода');
  });
  await page.waitForFunction(()=>window.__smokeGame.scene.getScene('Room').world.cleansing.enemies[0].actorState.phase==='attack',{},{timeout:12000});
  ok(await page.evaluate(setup=>{
    const s=window.__smokeGame.scene.getScene('Room'),e=s.world.cleansing.enemies[0];
    return e.x>setup.r.x+setup.r.width&&Math.hypot(e.x-setup.goal.x,e.y-setup.goal.y)<65;
  },setup),'В настоящей физике муха, прижатая к стволу, облетает его и доходит до атаки');
  const arena=await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),e=s.world.cleansing.enemies[0],nav=e.behavior.navigation;
    s.physics.pause();const all=[...s.world.wolves,...s.world.mice,...s.world.cleansing.enemies];all.forEach(e=>{e.body.enable=false;e.setVelocity(0,0);});
    for(let y=250;y<s.layout.height-200;y+=70)for(let x=300;x<s.layout.width-300;x+=70) {
      if(!nav.clear({x:x-200,y},{x:x+200,y})||!nav.clear({x,y:y-120},{x,y:y+120}))continue;
      const wolf=s.world.wolves[0];wolf.setActive(true);wolf.updateBehavior=()=>{};wolf.body.enable=true;wolf.body.reset(x,y);
      const offset=s.player.body.bottom-s.player.y;s.player.body.reset(x+160,y-offset);s.player.body.updateFromGameObject();
      e.body.enable=true;e.body.reset(x-150,y);e.body.updateFromGameObject();e.actorState.phase='chase';e.actorState.elapsed=0;e.behavior.restoreFlight();
      s.physics.resume();return {x,y};
    }
    throw new Error('Нет свободного места для обхода волка');
  });
  await page.waitForFunction(()=>window.__smokeGame.scene.getScene('Room').world.cleansing.enemies[0].actorState.phase==='attack',{},{timeout:12000});
  ok(await page.evaluate(arena=>{const s=window.__smokeGame.scene.getScene('Room'),e=s.world.cleansing.enemies[0];return e.x>arena.x+100&&s.world.wolves[0].x===arena.x;},arena),
    'Муха облетает неподвижного волка, сохраняя столкновения и не проталкивая его');
  // A real acorn supplies its flight direction to the hit reaction.
  const initial=await page.evaluate(async arena=>{
    const s=window.__smokeGame.scene.getScene('Room'),e=s.world.cleansing.enemies[0];s.physics.pause();
    [...s.world.wolves,...s.world.mice,...s.world.cleansing.enemies].forEach(o=>{o.body.enable=false;o.setVelocity(0,0);});
    e.body.enable=true;e.body.reset(arena.x,arena.y);e.body.updateFromGameObject();e.behavior.restoreFlight();
    e.actorState.phase='attack';e.actorState.elapsed=100;e.attackConnected=false;
    const offset=s.player.body.bottom-s.player.y;s.player.body.reset(arena.x-350,arena.y-offset);s.player.body.updateFromGameObject();
    const {AcornProjectile}=await import('/src/entities/AcornProjectile.ts'),body=e.body;
    const shot=new AcornProjectile(s,s.player,body.x-40,body.center.y,{x:1,y:0});
    s.acorns.shots.push(shot);shot.body.reset(body.right+40,body.center.y);shot.body.updateFromGameObject();s.acorns.update(0);
    s.physics.resume();return {x:e.x,y:e.y,hp:e.actorState.health,shotGone:!shot.scene,unchangedColor:!e.isTinted&&e.alpha===1&&e.visible};
  },arena);
  await page.waitForTimeout(110);
  ok(initial.hp===1&&initial.shotGone&&initial.unchangedColor&&await page.evaluate(initial=>{
    const e=window.__smokeGame.scene.getScene('Room').world.cleansing.enemies[0];
    return e.hitElapsed!==null&&!e.isTinted&&e.alpha===1&&e.visible&&e.x>initial.x+5&&e.x<initial.x+22&&Math.abs(e.y-initial.y)<1&&
      Math.abs(e.angle)>2&&e.texture.key==='insect-fly'&&e.body.enable&&e.actorState.phase!=='attack';
  },initial),'Настоящий жёлудь отбрасывает муху по направлению попадания, наклоняет её и прерывает жало без мигания и смены цвета; физика остаётся активной');
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),e=s.world.cleansing.enemies[0];s.physics.pause();
    const saved=e.snapshot(),angle=e.angle,velocity=e.body.velocity.x;
    e.restore(saved);
    const snapshot={version:1,savedAt:Date.now(),characterId:s.characterId,layout:s.layout,player:s.player.snapshot(),camera:{...s.cameraFollow.center},world:s.world.snapshot(),shots:s.acorns.snapshot()};
    const {isRunSave}=await import('/src/persistence/runSave.ts'),valid=isRunSave(snapshot);
    const bad=structuredClone(snapshot);bad.world.cleansing.enemies[0].hitPush={x:20,y:0};
    return valid&&!isRunSave(bad)&&Math.abs(e.angle-angle)<.001&&Math.abs(e.body.velocity.x-velocity)<.001&&e.snapshot().hitPush.x===1;
  }),'Сохранение восстанавливает направление, наклон и скорость отбрасывания; повреждённый вектор отвергается');
  ok(await page.evaluate(()=>{
    const e=window.__smokeGame.scene.getScene('Room').world.cleansing.enemies[0];e.updateBehavior(300);
    return e.hitElapsed===null&&e.angle===0&&!e.isTinted&&e.actorState.phase==='chase'&&Math.hypot(e.body.velocity.x,e.body.velocity.y)>0;
  }),'После 260 мс реакция завершается: муха выравнивается и продолжает погоню');
  const wall=await page.evaluate(setup=>{
    const s=window.__smokeGame.scene.getScene('Room'),e=s.world.cleansing.enemies[0],r=setup.r;
    e.hitElapsed=null;e.setAngle(0).clearTint();e.actorState.health=2;e.behavior.restoreFlight();
    e.body.reset(r.x+r.width+16,r.y+r.height/2+9);e.body.updateFromGameObject();
    const offset=s.player.body.bottom-s.player.y;s.player.body.reset(setup.start.x-90,setup.start.y-offset);s.player.body.updateFromGameObject();
    e.takeDamage(1,{x:-1,y:0});s.physics.resume();return {x:e.x,y:e.y,r};
  },setup);
  await page.waitForTimeout(120);
  ok(await page.evaluate(wall=>{
    const e=window.__smokeGame.scene.getScene('Room').world.cleansing.enemies[0];
    return e.hitElapsed!==null&&e.body.left>=wall.r.x+wall.r.width-.1&&e.actorState.health===1;
  },wall),'Отбрасывание у самого ствола ограничено настоящей коллизией, муха не проходит внутрь дерева');
  await page.waitForFunction(()=>window.__smokeGame.scene.getScene('Room').world.cleansing.enemies[0].actorState.phase==='attack',{},{timeout:12000});
  ok(await page.evaluate(wall=>{
    const e=window.__smokeGame.scene.getScene('Room').world.cleansing.enemies[0];return e.x<wall.r.x&&e.hitElapsed===null;
  },wall),'После удара в ствол муха снова выбирается из контакта, облетает дерево и продолжает атаку');
  const old=await page.evaluateHandle(seed=>{const s=window.__smokeGame.scene.getScene('Room'),p=s.player;s.scene.restart({seed});return p;},seed);
  await page.waitForFunction(p=>window.__smokeGame.scene.getScene('Room').player!==p,old);await old.dispose();await waitScene('Room');
}
