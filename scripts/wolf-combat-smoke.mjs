import { isolateSingleWolf } from './wolf-fixture.mjs';
/** Real projectile hits, retained leaves, paused attacks and permanent death. */
export async function testWolfCombat(page, ok) {
  const previous=await page.evaluateHandle(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),old=s.player;s.scene.restart({seed:0});return old;
  });
  await page.waitForFunction(old=>{
    const s=window.__smokeGame.scene.getScene('Room');return s.player!==old&&s.world?.wolves?.[0]?.body?.enable;
  },previous);await previous.dispose();await isolateSingleWolf(page);
  await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),w=s.world.wolves[0],nav=w.behavior.navigation;
    for(const mouse of s.world.mice){mouse.setActive(false).setVelocity(0,0);mouse.body.enable=false;}
    let f;
    for(let y=250;y<1800&&!f;y+=100)for(let x=250;x<3200&&!f;x+=100){
      if(nav.clear({x:x-80,y},{x:x+400,y})&&nav.canStand({x,y})&&nav.canStand({x:x+300,y}))f={x,y};
    }
    if(!f)throw new Error('No clear wolf combat fixture');
    window.__combatFixture=f;
    const p=s.player;p.cancelCast();p.cancelHit();p.body.reset(f.x,f.y-22.5);p.body.updateFromGameObject();
    w.body.reset(f.x+300,f.y);w.body.updateFromGameObject();
    w.actorState.runSpeed=0;w.actorState.walkSpeed=0;
    window.__wolfCombat={hitFrames:new Set(),deathFrames:new Set(),positions:new Set(),elapsed:new Set(),zero:true};
    const observe=()=>{
      const o=window.__wolfCombat;
      if(w.reactingToHit){
        o.hitFrames.add(`${w.texture.key}:${w.frame.name}`);o.positions.add(`${w.x}:${w.y}`);
        o.elapsed.add(w.actorState.elapsed);o.zero&&=w.body.velocity.length()===0;
      }
      if(w.dying&&w.scene)o.deathFrames.add(w.frame.name);
    };
    s.events.on('postupdate',observe);window.__combatObserver=observe;
  });
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room');
    return s.world.wolves[0].actorState.health===2&&s.world.wolves[0].actorState.maxHealth===2&&s.player.actorState.attackRate===1;
  }),'У каждого нового волка 2 скрытых HP, у друида скорострельность 1');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>{
    const w=window.__smokeGame.scene.getScene('Room').world.wolves[0];
    return w.actorState.health===1&&w.reactingToHit&&w.texture.key==='wolf-death';
  });
  const impact=await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room');
    window.__impactLeaves=s.acorns.leaves.map(l=>({image:l.image,x:l.image.x,y:l.image.y}));
    return s.acorns.shots.length===0&&window.__impactLeaves.length>0&&s.playerHealth===3;
  });
  ok(impact,'Настоящий жёлудь наносит ровно 1 HP и исчезает; листочки остаются, HP друида прежние');
  await page.screenshot({path:'test-results/wolf-hit.png'});
  await page.waitForFunction(()=>!window.__smokeGame.scene.getScene('Room').world.wolves[0].reactingToHit);
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),o=window.__wolfCombat,w=s.world.wolves[0];
    return w.actorState.health===1&&w.actorState.phase==='chase'&&o.hitFrames.size>=3&&
      o.positions.size===1&&o.elapsed.size===1&&o.zero&&
      window.__impactLeaves.some(l=>l.image.scene&&(l.image.x!==l.x||l.image.y!==l.y));
  }),'Реакция меняет кадры и останавливает тело/таймер ИИ на 260 мс; погоня возобновляется, листья продолжают лететь');

  const oldWolf=await page.evaluateHandle(()=>window.__smokeGame.scene.getScene('Room').world.wolves[0]);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(old=>old.dying&&old.scene,oldWolf);
  ok(await page.evaluate(old=>old.actorState.health===0&&!old.body.enable&&old.body.velocity.length()===0&&
    !old.takeDamage(1)&&old.texture.key==='wolf-death',oldWolf),
  'Второй жёлудь запускает смерть: HP 0, нет движения/коллизии и повторного урона');
  await page.waitForFunction(old=>window.__smokeGame.scene.getScene('Room').world.corpses.includes(old),oldWolf);
  await page.waitForFunction(()=>{
    const s=window.__smokeGame.scene.getScene('Room');return s.physics.world.colliders.getActive().length===s.world.mice.length+2+(s.world.bear&&!s.world.bear.dying?2:0)+s.world.skeletons.filter(e=>!e.dying).length*2+s.world.sprouts.enemies.filter(e=>!e.dying).length*2;
  });
  ok(await page.evaluate(old=>{
    const s=window.__smokeGame.scene.getScene('Room');
    s.events.off('postupdate',window.__combatObserver);
    s.world.update(10000);
    return window.__wolfCombat.deathFrames.size===7&&old.scene===s&&old.shadow.scene===s&&
      !old.active&&old.visible&&old.shadow.visible&&!old.body.enable&&old.frame.name==='6'&&
      old.x===window.__combatFixture.x+300&&old.y===window.__combatFixture.y&&
      s.world.wolves.length===0&&s.world.corpses.length===1&&
      s.children.list.filter(o=>o.name==='wolf-corpse').length===1&&
      s.children.list.filter(o=>o.name==='wolf-corpse-shadow').length===1;
  },oldWolf),'Все 7 кадров смерти проиграны один раз; труп с тенью остаётся на месте и через 10 секунд, без коллизии и замены');

  // A fresh run supplies the next test enemy; the game no longer respawns one.
  const priorPlayer=await page.evaluateHandle(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),p=s.player;s.scene.restart({seed:0});return p;
  });
  await page.waitForFunction(p=>window.__smokeGame.scene.getScene('Room').player!==p,priorPlayer);
  await priorPlayer.dispose();await isolateSingleWolf(page);
  ok(await page.evaluate(old=>!old.scene&&!old.shadow.scene&&
    window.__smokeGame.scene.getScene('Room').world.corpses.length===0,oldWolf),
  'Новая поляна очищает трупы и их тени предыдущего забега');
  await oldWolf.dispose();

  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),p=s.player,w=s.world.wolves[0];
    p.cancelHit();p.cancelCast();w.body.reset(p.x-47,p.body.bottom);w.body.updateFromGameObject();
    w.actorState.alerted=true;w.actorState.phase='attack';w.actorState.elapsed=100;
    w.takeDamage(1);w.updateBehavior(259);
    const paused=w.reactingToHit&&w.actorState.elapsed===100&&!p.hitReaction.active&&w.body.velocity.length()===0;
    w.updateBehavior(1);const resumed=!w.reactingToHit&&w.actorState.elapsed===100;
    w.updateBehavior(140);const connected=p.hitReaction.active;
    p.cancelHit();w.updateBehavior(1);
    return paused&&resumed&&connected&&!p.hitReaction.active&&s.playerHealth===2;
  }),'Попадание посреди атаки сохраняет её фазу: после паузы волк завершает удар без повторного попадания');

  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),w=s.world.wolves[0],p=s.player,f=window.__combatFixture;
    const{AcornProjectile}=await import('/src/entities/AcornProjectile.ts');
    w.setActive(false).setVelocity(0,0);w.body.reset(f.x+300,f.y);w.body.updateFromGameObject();
    const health=w.actorState.health;
    const barrier=s.physics.add.staticImage(f.x+150,f.y-9,'acorn').setSize(8,30);barrier.refreshBody();
    const shot=new AcornProjectile(s,p,f.x+60,f.y-9,{x:1,y:0});s.acorns.shots.push(shot);
    shot.body.reset(f.x+360,f.y-9);shot.body.updateFromGameObject();s.acorns.update(0);
    const blocked=!shot.scene&&w.actorState.health===health;barrier.destroy();
    return blocked;
  }),'На длинном кадре стена перед волком поглощает жёлудь: урон не проходит сквозь ближайшее препятствие');

  const dying=await page.evaluateHandle(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),w=s.world.wolves[0];w.setActive(true);w.takeDamage(1);
    s.scene.restart({seed:0});return w;
  });
  await page.waitForFunction(old=>{
    const s=window.__smokeGame.scene.getScene('Room');return s.world.wolves[0]!==old&&s.world.wolves[0]?.body?.enable;
  },dying);
  await isolateSingleWolf(page);
  ok(await page.evaluate(old=>{
    const s=window.__smokeGame.scene.getScene('Room');
    return !old.scene&&!old.shadow.scene&&s.world.wolves[0].actorState.health===2&&
      s.children.list.filter(o=>o.name==='wolf').length===1;
  },dying),'Перезапуск во время смерти удаляет старого волка и не оставляет отложенное появление дубликата');
  await dying.dispose();
}
