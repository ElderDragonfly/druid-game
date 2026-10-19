/** Full population, projectile awareness, real pack damage and death UI. */
export async function testWolfPack(page,ok) {
  ok(await page.evaluate(async()=>{
    const{segmentTouchesEllipse:touches}=await import('/src/physics/ellipse.ts');
    const c={x:500,y:400};
    return touches({x:692,y:400},{x:692,y:400},c,192,108)&&
      !touches({x:693,y:400},{x:693,y:400},c,192,108)&&
      touches({x:500,y:508},{x:500,y:508},c,192,108)&&
      !touches({x:500,y:509},{x:500,y:509},c,192,108)&&
      touches({x:200,y:400},{x:800,y:400},c,192,108)&&
      !touches({x:200,y:509},{x:800,y:509},c,192,108);
  }),'Овал желудей 192×108: точные границы и пролёт через весь овал между кадрами');
  const population=await page.evaluate(async()=>{
    const{generateMeadow}=await import('/src/world/meadowLayout.ts');
    const{WolfNavigation}=await import('/src/world/WolfNavigation.ts');
    const{generateWolfPopulation}=await import('/src/world/wolfPopulation.ts');
    const counts=[];let valid=true,cluster=false;
    for(let seed=0;seed<32;seed++){
      const layout=generateMeadow(seed),nav=new WolfNavigation(layout),points=generateWolfPopulation(nav);
      counts.push(points.length);
      const cells=new Array(9).fill(0),center={x:layout.spawn.x,y:layout.spawn.y+22.5};
      valid&&=JSON.stringify(points)===JSON.stringify(generateWolfPopulation(nav));
      for(let i=0;i<points.length;i++){
        const p=points[i];cells[Math.floor(p.y/(layout.height/3))*3+Math.floor(p.x/(layout.width/3))]++;
        valid&&=nav.canStand(p)&&nav.route(p,center).length>0&&
          Math.hypot((p.x-center.x)/(1280/3),(p.y-center.y)/240)>1&&
          points.slice(0,i).every(q=>Math.hypot(p.x-q.x,p.y-q.y)>=100);
      }
      cluster||=cells.some(n=>n>2);
    }
    return{valid,cluster,min:Math.min(...counts),max:Math.max(...counts),mean:counts.reduce((a,b)=>a+b)/counts.length};
  });
  ok(population.valid&&population.cluster&&population.min===0&&population.max===18&&population.mean>6&&population.mean<12,
    `Волки свободно распределены по миру: 0–18, без квот участков, среднее на 32 seed ${population.mean.toFixed(2)}; без стволов, пересечений и агрессии у старта`);

  const old=await page.evaluateHandle(()=>{const s=window.__smokeGame.scene.getScene('Room'),p=s.player;s.scene.restart({seed:0});return p;});
  await page.waitForFunction(p=>{
    const s=window.__smokeGame.scene.getScene('Room');return s.player!==p&&s.world?.wolves?.length===18;
  },old);await old.dispose();
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room');
    return s.world.wolves.length===18&&s.world.wolves.every(w=>w.actorState.health===2&&w.body.enable&&
      [w,w.shadow].every(o=>o.cameraFilter&s.cameras.getCamera('hud').id));
  }),'В реальной сцене все 18 волков имеют собственные HP, физику и тень, скрытую от HUD-камеры');
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),world=s.world,old=world.wolves.slice(0,2);
    old.forEach(w=>w.takeDamage(2));world.update(1820);
    world.update(10000);
    return world.wolves.length===16&&old.every(w=>!w.scene&&!w.shadow.scene)&&
      world.wolves.every(w=>!old.includes(w));
  }),'После смерти двух волков стая уменьшается с 18 до 16, новых волков не появляется');
  await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),world=s.world,nav=world.wolves[0].behavior.navigation;
    for(const w of world.wolves){w.setActive(false).setVelocity(0,0);w.body.enable=false;}
    for(const m of world.mice){m.setActive(false).setVelocity(0,0);m.body.enable=false;}
    let f;
    for(let y=250;y<1800&&!f;y+=100)for(let x=850;x<3000&&!f;x+=100)
      if(nav.clear({x:x-300,y:y+60},{x:x+520,y:y+60})&&nav.canStand({x,y})&&nav.canStand({x:x+430,y}))f={x,y};
    if(!f)throw new Error('No clear pack projectile fixture');
    window.__packFixture=f;
    const p=s.player;p.cancelCast();p.cancelHit();p.body.reset(f.x-650,f.y+60-22.5);p.body.updateFromGameObject();
    world.wolves.slice(0,2).forEach((w,i)=>{
      w.body.enable=true;w.body.reset(f.x+i*430,f.y);w.body.updateFromGameObject();
      w.setActive(true);w.actorState.alerted=false;w.actorState.phase='idle';w.actorState.elapsed=0;
      w.actorState.runSpeed=0;w.actorState.walkSpeed=0;
    });
    const{AcornProjectile}=await import('/src/entities/AcornProjectile.ts');
    s.acorns.shots.push(new AcornProjectile(s,p,f.x-260,f.y+60,{x:1,y:0}));
  });
  await page.waitForFunction(()=>window.__smokeGame.scene.getScene('Room').world.wolves[0].actorState.alerted);
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),[a,b]=s.world.wolves,p=s.player.body;
    return a.actorState.alerted&&!b.actorState.alerted&&a.actorState.health===2&&b.actorState.health===2&&
      !a.behavior.detects(a,{x:p.center.x,y:p.bottom});
  }),'Пролетающий мимо жёлудь агрит ближнего волка на далёкого друида без попадания; другой волк остаётся спокойным');

  const first=await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),p=s.player,f=window.__packFixture;
    p.body.reset(f.x,f.y-22.5);p.body.updateFromGameObject();p.cancelCast();p.cancelHit();
    for(const shot of s.acorns.shots)shot.destroy();s.acorns.shots.length=0;
    window.__packHealth=[];p.on('health-changed',()=>window.__packHealth.push(p.actorState.health));
    s.world.wolves.slice(0,2).forEach((w,i)=>{
      w.body.reset(p.x+(i?43:-47),p.body.bottom);w.body.updateFromGameObject();
      w.actorState.alerted=true;w.actorState.phase='attack';w.actorState.elapsed=230;w.attackConnected=false;
    });
    s.world.update(20);
    return p.actorState.health===2&&p.hitReaction.active&&!s.gameOver&&s.healthLabel.text==='HP 2/3'&&
      !p.takeDamage(1)&&p.actorState.health===2;
  });
  ok(first,'Два укуса в одном кадре снимают только 1 HP: сердечки обновлены, 400 мс реакции защищают от повторного урона');
  await page.waitForFunction(()=>window.__smokeGame.scene.getScene('Room').gameOver,null,{timeout:5000});
  const dead=await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room');
    window.__deadSnapshot={x:s.player.x,y:s.player.y,emitted:s.acorns.emittedCount,
      wolves:s.world.wolves.map(w=>({x:w.x,y:w.y,clock:w.clock}))};
    return s.playerHealth===0&&s.player.dead&&s.physics.world.isPaused&&s.healthLabel.text==='HP 0/3'&&
      JSON.stringify(window.__packHealth)==='[2,1,0]'&&!s.player.takeDamage(1)&&s.deathOverlay.visible;
  });
  ok(dead,'Три реальных укуса дают HP 3→2→1→0 и завершают игру ровно один раз');
  await page.keyboard.down('d');await page.keyboard.down('ArrowRight');await page.waitForTimeout(1600);
  await page.keyboard.up('d');await page.keyboard.up('ArrowRight');
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),old=window.__deadSnapshot,o=s.deathOverlay;
    return s.player.x===old.x&&s.player.y===old.y&&s.acorns.emittedCount===old.emitted&&
      s.world.wolves.every((w,i)=>w.x===old.wolves[i].x&&w.y===old.wolves[i].y&&w.clock===old.wolves[i].clock)&&
      o.title.text==='You dead'&&o.title.alpha>.99&&o.shade.alpha>.84;
  }),'После гибели WASD/стрелки и мир заморожены, затемнение и красная надпись You dead плавно проявляются');
  await page.screenshot({path:'test-results/you-dead.png'});
  await page.setViewportSize({width:960,height:640});await page.waitForTimeout(100);
  ok(await page.evaluate(()=>{
    const o=window.__smokeGame.scene.getScene('Room').deathOverlay;
    return o.shade.width===960&&o.shade.height===640&&o.title.x===480&&o.title.y===320;
  }),'Экран гибели покрывает всё окно и сохраняет центр после изменения разрешения');
  const oldPlayer=await page.evaluateHandle(()=>window.__smokeGame.scene.getScene('Room').player);
  await page.keyboard.press('r');
  await page.waitForFunction(p=>window.__smokeGame.scene.getScene('Room').player!==p,oldPlayer);
  ok(await page.evaluate(p=>{
    const s=window.__smokeGame.scene.getScene('Room');return !p.scene&&!s.gameOver&&!s.physics.world.isPaused&&
      s.playerHealth===3&&!s.deathOverlay.visible&&s.children.list.filter(o=>o.name==='death-overlay').length===0;
  },oldPlayer),'R после гибели начинает новую поляну с 3 HP и работающей физикой, без старого затемнения');
  await oldPlayer.dispose();
  await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').player.takeDamage(3));
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.__smokeGame.scene.isActive('CharacterSelect')&&!window.__smokeGame.scene.isActive('Room'));
  ok(true,'Esc после гибели возвращает к выбору персонажа');
  await page.evaluate(()=>window.__smokeGame.scene.getScene('CharacterSelect').scene.start('Room',{seed:3}));
  await page.waitForFunction(()=>{
    const s=window.__smokeGame.scene.getScene('Room');return s.sys.isActive()&&s.layout.seed===3&&s.world.wolves.length===0;
  });
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room');return s.playerHealth===3&&!s.gameOver&&!s.physics.world.isPaused;
  }),'Нулевая популяция — рабочая случайная поляна; выход из экрана гибели не оставляет замороженную физику');
}
