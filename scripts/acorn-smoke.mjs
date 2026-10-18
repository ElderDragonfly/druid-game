/** Actual cast timing, projectile travel, all-body collision, wake and cleanup. */
export async function testAcornAttack(page,ok) {
  const timing=await page.evaluate(async()=>{
    const{DruidCasting}=await import('/src/behavior/DruidCasting.ts');
    const{ACORN}=await import('/src/data/acorn.ts');
    const cast=new DruidCasting(ACORN.releaseMs);
    cast.update(0,'right');cast.update(579);
    const early=cast.consumeRelease()===undefined;
    cast.update(1);const late=cast.consumeRelease()==='right'&&cast.consumeRelease()===undefined;
    cast.update(40);const once=cast.consumeRelease()===undefined;
    cast.cancel();cast.update(0,'right');cast.update(579);cast.cancel();cast.update(100);
    const interrupted=cast.consumeRelease()===undefined;
    cast.update(0,'right');cast.update(580);cast.cancel();
    const sameFrame=cast.consumeRelease()===undefined;
    cast.update(0,'right');cast.update(700);
    return early&&late&&once&&interrupted&&sameFrame&&cast.consumeRelease()==='right'&&!cast.active;
  });
  ok(timing,'Жёлудь выпускается один раз после 580 мс; отмена, включая тот же кадр, убирает ожидающий выстрел');
  ok(await page.evaluate(async()=>{
    const{sweptRect,worldExit}=await import('/src/physics/projectileSweep.ts');
    const from={x:20,y:50},to={x:200,y:50},rect={x:100,y:40,width:1,height:20};
    return Math.abs(sweptRect(from,to,rect,5)-75/180)<1e-6&&
      sweptRect({x:20,y:20},{x:200,y:20},rect,5)===undefined&&
      sweptRect({x:100,y:50},to,rect,5)===0&&
      worldExit(from,{x:500,y:50},{x:0,y:0,width:300,height:200},5)>0;
  }),'Проверка всего пути ловит тонкие препятствия, появление внутри коллайдера и границы мира');

  const old=await page.evaluateHandle(()=>{const s=window.__smokeGame.scene.getScene('Room'),old=s.player;s.scene.restart({seed:0});return old;});
  await page.waitForFunction(old=>{
    const s=window.__smokeGame.scene.getScene('Room');
    return s.player!==old&&s.acorns&&s.world?.wolf?.body?.enable;
  },old);await old.dispose();
  await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room');
    s.world.wolf.setActive(false).setVelocity(0,0);s.world.wolf.body.enable=false;
    for(const m of s.world.mice){m.setActive(false).setVelocity(0,0);m.body.enable=false;}
    const{obstacleRect}=await import('/src/world/meadowLayout.ts');const trees=s.layout.obstacles.map(obstacleRect);
    let f;
    for(let y=200;y<1950&&!f;y+=80)for(let x=200;x<2800&&!f;x+=80){
      if(!trees.some(r=>x-40<r.x+r.width&&x+800>r.x&&y-70<r.y+r.height&&y+70>r.y))f={x,y};
    }
    if(!f)throw new Error('No clear acorn trajectory fixture');
    const{AcornAttack}=await import('/src/world/AcornAttack.ts');
    const{seededRandom}=await import('/src/world/meadowLayout.ts');
    s.acorns.destroy();s.acorns=new AcornAttack(s,s.player,seededRandom(0xac07));
    window.__acornFixture=f;s.player.body.reset(f.x,f.y);s.player.cancelCast();s.player.cancelHit();
  });
  const before=await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').acorns.emittedCount);
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(330);
  ok(await page.evaluate(n=>window.__smokeGame.scene.getScene('Room').acorns.emittedCount===n,before),
    'Нажатие вправо начинает жест, первые 330 мс снаряда нет');
  await page.keyboard.up('ArrowRight');
  await page.waitForFunction(n=>window.__smokeGame.scene.getScene('Room').acorns.emittedCount>n,before);
  const start=await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),shot=s.acorns.shots[0];
    if(!shot)throw new Error('Released acorn vanished in clear fixture');
    const p=s.player,b=p.body;
    return{x:shot.x,y:shot.y,rotation:shot.visual.rotation,age:shot.ageMs,
      xOffset:shot.x-p.x,visualOffset:shot.visual.y-p.y,
      bodyHeight:shot.body.height,speed:shot.body.velocity.x,
      hud:!!(shot.visual.cameraFilter&s.cameras.getCamera('hud').id),
      ground:Math.abs(shot.body.center.y-b.center.y)<.01};
  });
  ok(start.xOffset>=41&&start.xOffset<53&&start.visualOffset<-20&&start.visualOffset>-36&&
    start.bodyHeight===10&&start.speed===220&&start.ground&&start.hud,
    `Жёлудь появляется отдельно от посоха в средней части друида; скорость 1,5 = 220, коллайдер на плоскости земли: ${JSON.stringify(start)}`);
  await page.waitForTimeout(550);
  const travel=await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),a=s.acorns,shot=a.shots[0];
    const leaves=a.leaves;const angles=leaves.map(l=>Math.atan(Math.abs(l.vy)/(220-l.vx))*180/Math.PI);
    const births=leaves.map(l=>l.image.x-l.vx*l.age/1000);
    const centers=[];for(let i=0;i+1<births.length;i+=2)centers.push((births[i]+births[i+1])/2);
    const spaces=centers.slice(1).map((x,i)=>x-centers[i]);
    return{x:shot.x,rotation:shot.visual.rotation,age:shot.ageMs,
      sides:leaves.some(l=>l.vy<0)&&leaves.some(l=>l.vy>0),
      angles:angles.length>=4&&angles.every(a=>a>=17&&a<=23),
      irregular:spaces.length>=2&&Math.max(...spaces)-Math.min(...spaces)>1,
      fade:leaves.some(l=>l.image.alpha<.9),
      green:leaves.every(l=>l.image.texture.key==='acorn-leaves'&&l.image.texture.source[0].scaleMode===1),
      health:s.playerHealth};
  });
  ok(Math.abs((travel.x-start.x)-220*(travel.age-start.age)/1000)<9&&travel.rotation>start.rotation+.3,
    'Полёт имеет заданную скорость и медленное вращение вокруг центра желудя');
  ok(travel.sides&&travel.angles&&travel.irregular&&travel.fade&&travel.green&&travel.health===3,
    'Зелёные листья образуют две ветви ±17–23°, появляются неравномерно, расходятся и плавно исчезают');
  await page.screenshot({path:'test-results/acorn-flight.png'});
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room');s.player.cancelCast();
    const old=s.acorns.leaves.map(l=>l.image);s.acorns.update(1200);
    return old.length>0&&old.every(image=>!image.scene)&&s.acorns.leaves.length===0;
  }),'Листья живут не более 1100 мс, затем полностью удаляются вместе с изображениями');

  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),p=s.player;
    const{AcornProjectile}=await import('/src/entities/AcornProjectile.ts');
    p.cancelCast();for(const shot of s.acorns.shots)shot.destroy();s.acorns.shots.length=0;
    const tree=s.world.obstacles.getChildren()[0].body;
    const wolf=s.world.wolf;wolf.setActive(false).setVelocity(0,0);wolf.body.enable=true;
    const f=window.__acornFixture;wolf.body.reset(f.x+350,f.y+22.5);
    const generic=s.physics.add.image(f.x+500,f.y+10,'acorn').setData('health',9);
    generic.setImmovable(true).setSize(8,20);generic.body.reset(f.x+500,f.y+10);
    let result=true;
    for(const target of [tree,wolf.body,generic.body]){
      const from={x:target.x-30,y:target.center.y},to={x:target.right+30,y:target.center.y};
      const shot=new AcornProjectile(s,p,from.x,from.y);s.acorns.shots.push(shot);
      shot.body.reset(to.x,to.y);shot.body.updateFromGameObject();s.acorns.update(0);result&&=!shot.scene;
    }
    // A point spawn inside an enabled body must disappear immediately too.
    const shot=new AcornProjectile(s,p,wolf.body.center.x,wolf.body.center.y);s.acorns.shots.push(shot);s.acorns.update(0);
    result&&=!shot.scene&&s.playerHealth===3&&generic.getData('health')===9;
    generic.destroy();wolf.body.enable=false;return result;
  }),'Жёлудь исчезает у дерева, волка и произвольного физического объекта, включая появление внутри него; урона нет');

  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),p=s.player,w=s.world.wolf,f=window.__acornFixture;
    p.cancelHit();p.cancelCast();p.body.reset(f.x,f.y);p.body.updateFromGameObject();const count=s.acorns.emittedCount;
    p.updateCasting(0,'right');p.updateCasting(580);
    w.setActive(true);w.body.enable=true;w.body.reset(p.x-47,p.body.bottom);
    w.body.updateFromGameObject();
    w.actorState.alerted=true;w.actorState.phase='attack';w.actorState.elapsed=230;
    w.updateBehavior(20);s.acorns.update(0);
    const cancelled=p.hitReaction.active&&!p.casting.active&&s.acorns.emittedCount===count;
    w.setActive(false);w.body.enable=false;p.cancelHit();return cancelled;
  }),'Удар настоящего волка отменяет даже готовый к выпуску жёлудь в том же кадре');
  const count=await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').acorns.emittedCount);
  await page.keyboard.down('ArrowUp');await page.waitForTimeout(740);await page.keyboard.up('ArrowUp');
  ok(await page.evaluate(n=>window.__smokeGame.scene.getScene('Room').acorns.emittedCount===n,count),
    'Другие направления сохраняют жесты без снарядов: пробная атака пока только вправо');
  await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').player.cancelCast());
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(1520);await page.keyboard.up('ArrowRight');
  ok(await page.evaluate(n=>window.__smokeGame.scene.getScene('Room').acorns.emittedCount===n+2,count),
    'Удержание вправо выпускает один жёлудь за завершённый замах, без раннего и повторного выстрела внутри жеста');
  const previous=await page.evaluateHandle(()=>{
    const s=window.__smokeGame.scene.getScene('Room');
    const old={manager:s.acorns,shot:s.acorns.shots[0],leaf:s.acorns.leaves[0]?.image};
    s.scene.restart({seed:0});return old;
  });
  await page.waitForFunction(old=>window.__smokeGame.scene.getScene('Room').acorns!==old.manager,previous);
  ok(await page.evaluate(old=>{
    const s=window.__smokeGame.scene.getScene('Room');
    return old.manager.shots.length===0&&old.manager.leaves.length===0&&
      (!old.shot||!old.shot.scene)&&(!old.leaf||!old.leaf.scene)&&s.acorns.emittedCount===0;
  },previous),'Перезапуск убирает желудь, листья и ожидающий выстрел, не переносит их в новую комнату');
  await previous.dispose();
}
