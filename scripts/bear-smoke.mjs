/** Third room scenario: spawn, wake/walk/run, attacks, wide navigation and saves. */
export async function testBear(page,ok,click,waitScene) {
  const seed=await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').layout.seed);
  ok(await page.evaluate(async()=>{
    const {generateMeadow}=await import('/src/world/meadowLayout.ts'),{roomAt}=await import('/src/world/rooms.ts');
    const {generateBearSpawn}=await import('/src/world/bearPopulation.ts'),{WolfNavigation}=await import('/src/world/WolfNavigation.ts');
    const {BEAR}=await import('/src/data/bear.ts');const positions=new Set();
    for(const seed of [...Array.from({length:60},(_,i)=>i),752]){
      const l=generateMeadow(seed),p=generateBearSpawn(l),again=generateBearSpawn(l);
      if(!p||roomAt(l,p)!==6||l.rooms[6].scenario!=='bear'||l.rooms[4].scenario!=='empty'||JSON.stringify(p)!==JSON.stringify(again))return false;
      const nav=new WolfNavigation(l,BEAR.body);if(!nav.canStand(p,24)||!nav.route(p,l.spawn).length)return false;
      positions.add(`${p.x},${p.y}`);
    }
    const old=generateMeadow(0);old.rooms[6].scenario='empty';
    return positions.size===61&&generateBearSpawn(old)===undefined;
  }),'61 seed, включая плотные кроны 752: медведь размещается в нижней левой комнате, без пересечений и с доступным маршрутом; старые комнаты сохранены');
  ok(await page.evaluate(async()=>{
    const {generateMeadow}=await import('/src/world/meadowLayout.ts'),{WolfNavigation}=await import('/src/world/WolfNavigation.ts');
    const {BearBehavior}=await import('/src/behavior/BearBehavior.ts'),{BEAR}=await import('/src/data/bear.ts');
    const {bearDuration,bearImpact}=await import('/src/rendering/bearArt.ts');
    const l={...generateMeadow(0),obstacles:[],logs:[],stump:undefined,rooms:undefined};
    const ai=new BearBehavior(new WolfNavigation(l,BEAR.body)),p={x:500,y:500};
    const body=q=>({x:q.x-10,y:q.y-25,width:20,height:25});
    ai.step(1000,p,{x:597,y:500},body({x:597,y:500}));if(ai.actorState.phase!=='sleep')return false;
    ai.step(16,p,{x:596,y:500},body({x:596,y:500}));if(ai.actorState.phase!=='wake')return false;
    const far={x:900,y:500};ai.step(800,p,far,body(far));
    if(ai.actorState.phase!=='walk'||ai.actorState.pursuitElapsed!==0)return false;
    let v=ai.step(1999,p,far,body(far));if(ai.actorState.phase!=='walk'||Math.abs(Math.hypot(v.x,v.y)-88)>.001)return false;
    v=ai.step(30000,p,far,body(far));if(ai.actorState.phase!=='walk'||ai.actorState.enraged)return false;
    ai.reactToHit();v=ai.step(16,p,far,body(far));
    if(ai.actorState.phase!=='run'||!ai.actorState.enraged||Math.abs(Math.hypot(v.x,v.y)-146.6666666667)>.001)return false;
    ai.reactToHit();ai.step(30000,p,far,body(far));if(ai.actorState.phase!=='run')return false;
    const types=new Set(),near={x:565,y:500};
    for(let n=0;n<60;n++){
      Object.assign(ai.actorState,{phase:'run',enraged:true,elapsed:0,cooldownMs:0,attackConnected:false});
      ai.step(0,p,near,body(near));if(ai.actorState.phase!=='attack')return false;
      const attack=ai.actorState.attack;types.add(attack);
      ai.step(bearImpact(attack)-1,p,near,body(near));if(ai.impactReady)return false;
      ai.step(1,p,near,body(near));if(!ai.impactReady)return false;
      ai.step(1,p,near,body(near));if(ai.impactReady)return false;
      ai.step(bearDuration(attack),p,near,body(near));if(ai.actorState.phase!=='walk'||ai.actorState.enraged)return false;
      const v=ai.step(16,p,far,body(far));if(Math.abs(Math.hypot(v.x,v.y)-88)>.001)return false;
    }
    // A hit cancels an unfinished attack and starts another run; only a completed
    // attack, even a miss, ends that run. Hitting a sleeping bear also enrages it.
    Object.assign(ai.actorState,{phase:'attack',elapsed:100,enraged:false});ai.reactToHit();
    if(ai.actorState.phase!=='run'||!ai.actorState.enraged)return false;
    const sleeping=new BearBehavior(new WolfNavigation(l,BEAR.body));sleeping.reactToHit();
    sleeping.step(800,p,far,body(far));
    return types.size===3&&sleeping.actorState.phase==='run'&&sleeping.actorState.enraged;
  }),'Овал 96×54, подъём 800 мс, ходьба 0,6 без таймера; попадание включает бег 1 до завершения одной из трёх атак, затем снова шаг');
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),b=s.world.bear;
    return b.actorState.health===5&&b.actorState.phase==='sleep'&&b.body.width===96&&b.body.height===28&&
      b.body.collideWorldBounds&&s.world.enemyCollisions.group.contains(b)&&
      [b,b.shadow].every(o=>o.cameraFilter&s.hudCamera.id)&&b.texture.key==='bear-sleep-left';
  }),'В игре спит медведь с 5 HP, отдельной тенью, коллизией 96×28 и общей группой врагов; HUD его не дублирует');
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),{BEAR_ART}=await import('/src/rendering/bearArt.ts');
    for(const name of ['sleep','wake','walk','run','swipe','bite','slam']){
      const left=s.textures.get(`bear-${name}-left`),right=s.textures.get(`bear-${name}-right`);
      if(left.source[0].scaleMode!==1||right.source[0].scaleMode!==1)return false;
      const im=left.getSourceImage(),canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=128;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0);const a=ctx.getImageData(0,0,im.width,128).data;
      ctx.clearRect(0,0,im.width,128);ctx.drawImage(right.getSourceImage(),0,0);const b=ctx.getImageData(0,0,im.width,128).data;
      for(let y=0;y<128;y++)for(let x=0;x<im.width;x++)for(let c=0;c<4;c++){
        const mirror=Math.floor(x/160)*160+159-x%160;
        if(a[(y*im.width+x)*4+c]!==b[(y*im.width+mirror)*4+c])return false;
      }
    }
    return BEAR_ART.length===14;
  }),'Сон, подъём, ходьба, бег и три атаки имеют точные отражения без смены палитры и с общей опорой');
  const arena=await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),b=s.world.bear,nav=b.behavior.navigation;s.physics.pause();
    s.world.wolves.forEach(w=>{w.setActive(false).setVelocity(0,0);w.body.enable=false;});
    s.world.mice.forEach(m=>m.body.enable=false);b.setActive(true).setVisible(true);b.shadow.setVisible(true);b.body.enable=true;
    s.player.cancelCast();s.player.cancelHit();s.player.actorState.health=3;
    for(let y=300;y<s.layout.height-200;y+=90)for(let x=400;x<s.layout.width-500;x+=90){
      if(!nav.clear({x:x-160,y},{x:x+450,y})||!nav.clear({x,y:y-100},{x,y:y+100}))continue;
      b.body.reset(x,y);b.body.updateFromGameObject();b.behavior.navigator.invalidate();return {x,y};
    }
    throw new Error('Нет места для проверки медведя');
  });
  await page.evaluate(arena=>{
    const s=window.__smokeGame.scene.getScene('Room'),b=s.world.bear,offset=s.player.body.bottom-s.player.y;
    s.player.body.reset(arena.x-110,arena.y-offset);s.player.body.updateFromGameObject();s.physics.resume();
  },arena);
  await page.keyboard.down('d');await page.waitForTimeout(350);await page.keyboard.up('d');
  ok(await page.evaluate(arena=>{
    const s=window.__smokeGame.scene.getScene('Room'),b=s.world.bear;
    return s.player.x<arena.x-55&&s.player.actorState.health===3&&['sleep','wake'].includes(b.actorState.phase);
  },arena),'Друид не проходит через спящего/просыпающегося медведя; раннего урона при приближении нет');
  await page.evaluate(arena=>{
    const s=window.__smokeGame.scene.getScene('Room'),b=s.world.bear,offset=s.player.body.bottom-s.player.y;s.physics.pause();
    s.player.body.reset(arena.x+420,arena.y-offset);s.player.body.updateFromGameObject();
    const saved=b.snapshot();Object.assign(saved,{x:arena.x,y:arena.y,clock:0,animation:'walk',hitElapsed:null});
    Object.assign(saved.state,{phase:'walk',enraged:false,elapsed:0,pursuitElapsed:0,cooldownMs:0});b.restore(saved);s.physics.resume();
  },arena);
  await page.waitForFunction(arena=>{
    const b=window.__smokeGame.scene.getScene('Room').world.bear;
    return b.x>arena.x+35&&b.clock>200;
  },arena,{timeout:4000});
  ok(await page.evaluate(arena=>{
    const b=window.__smokeGame.scene.getScene('Room').world.bear;
    return b.actorState.phase==='walk'&&b.x>arena.x+30&&b.x<arena.x+65&&b.texture.key==='bear-walk-right'&&b.clock>200&&
      Math.abs(b.body.velocity.length()-88)<.01;
  },arena),'Реальная ходьба использует правые кадры и темп по расстоянию, скорость около 88 ед./с');
  await page.waitForTimeout(1550);
  ok(await page.evaluate(()=>{const b=window.__smokeGame.scene.getScene('Room').world.bear;return b.actorState.phase==='walk'&&!b.actorState.enraged;}),
    'Без попаданий медведь продолжает идти и не переходит на бег через две секунды');
  await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').world.bear.takeDamage(1));
  await page.waitForTimeout(400);
  ok(await page.evaluate(()=>{
    const b=window.__smokeGame.scene.getScene('Room').world.bear;
    const passed=b.actorState.phase==='run'&&b.actorState.enraged&&b.actorState.health===4&&Math.abs(b.body.velocity.length()-146.6666666667)<.01&&b.texture.key==='bear-run-right';
    b.actorState.health=5;return passed;
  }),'Попадание прерывает ходьбу; после короткой реакции медведь бежит со скоростью 1 и отдельной анимацией');
  await page.evaluate(arena=>{
    const s=window.__smokeGame.scene.getScene('Room'),b=s.world.bear,w=s.world.wolves[0],offset=s.player.body.bottom-s.player.y;
    s.physics.pause();w.setActive(true).setVelocity(0,0);w.updateBehavior=()=>{};w.body.enable=true;w.body.reset(arena.x+160,arena.y);w.body.updateFromGameObject();
    s.player.body.reset(arena.x+350,arena.y-offset);s.player.body.updateFromGameObject();
    const saved=b.snapshot();Object.assign(saved,{x:arena.x,y:arena.y,animation:'run',clock:0,hitElapsed:null});
    Object.assign(saved.state,{phase:'run',enraged:true,pursuitElapsed:3000,elapsed:0,cooldownMs:0});b.restore(saved);s.physics.resume();
  },arena);
  await page.waitForFunction(()=>window.__smokeGame.scene.getScene('Room').world.bear.actorState.phase==='attack',{},{timeout:15000});
  ok(await page.evaluate(arena=>{
    const s=window.__smokeGame.scene.getScene('Room'),b=s.world.bear,w=s.world.wolves[0];
    const passed=b.x>w.x+100&&Math.abs(w.x-arena.x-160)<.01;w.body.enable=false;w.setActive(false);return passed;
  },arena),'Медведь обходит неподвижного волка, не проходит сквозь него и не проталкивает его');
  ok(await page.evaluate(async arena=>{
    const s=window.__smokeGame.scene.getScene('Room'),b=s.world.bear;s.physics.pause();
    const {bearImpact}=await import('/src/rendering/bearArt.ts');
    for(const attack of ['swipe','bite','slam'])for(const left of [true,false]){
      s.player.cancelHit();s.player.actorState.health=3;
      b.body.reset(arena.x,arena.y);b.body.updateFromGameObject();const offset=s.player.body.bottom-s.player.y;
      s.player.body.reset(arena.x+(left?-72:72),arena.y-offset);s.player.body.updateFromGameObject();
      Object.assign(b.actorState,{phase:'attack',enraged:true,elapsed:0,pursuitElapsed:3000,attack,attackConnected:false,facingLeft:left});
      b.updateBehavior(bearImpact(attack)-1);if(s.player.actorState.health!==3)return false;
      b.updateBehavior(1);if(s.player.actorState.health!==2||b.texture.key!==`bear-${attack}-${left?'left':'right'}`)return false;
      b.updateBehavior(1);if(s.player.actorState.health!==2)return false;
    }
    s.player.cancelHit();s.player.actorState.health=3;return true;
  },arena),'Каждая из трёх атак слева/справа снимает ровно 1 HP в фазе контакта и не повторяет урон в том же замахе');
  const obstacle=await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),b=s.world.bear,{obstacleRect}=await import('/src/world/meadowLayout.ts'),nav=b.behavior.navigation;
    for(const o of s.layout.obstacles){const r=obstacleRect(o),start={x:r.x-48,y:r.y+r.height/2+14},goal={x:r.x+r.width+150,y:start.y};
      if(!nav.canStand(start,-.01)||!nav.canStand(goal)||!nav.routeFromContact(start,goal).length)continue;
      const offset=s.player.body.bottom-s.player.y;s.player.body.reset(goal.x,goal.y-offset);s.player.body.updateFromGameObject();
      const saved=b.snapshot();Object.assign(saved,{x:start.x,y:start.y,animation:'run',clock:0,hitElapsed:null});Object.assign(saved.state,{phase:'run',enraged:true,pursuitElapsed:3000,elapsed:0});
      b.restore(saved);s.physics.resume();return r;
    }throw new Error('Нет дерева для широкого медведя');
  });
  await page.waitForFunction(()=>window.__smokeGame.scene.getScene('Room').world.bear.actorState.phase==='attack',{},{timeout:15000});
  ok(await page.evaluate(r=>{const b=window.__smokeGame.scene.getScene('Room').world.bear;return b.x>r.x+r.width;},obstacle),
    'Медведь с широкой коллизией выбирается из касания ствола, обходит его и доходит до атаки');
  await page.evaluate(arena=>{
    const s=window.__smokeGame.scene.getScene('Room'),b=s.world.bear;s.physics.pause();s.player.cancelHit();s.player.actorState.health=3;
    b.actorState.phase='attack';b.actorState.enraged=true;b.actorState.attack='slam';b.actorState.elapsed=350;b.actorState.attackConnected=false;b.updateBehavior(0);
    const offset=s.player.body.bottom-s.player.y;s.player.body.reset(arena.x-200,arena.y-offset);s.player.body.updateFromGameObject();
  },arena);
  await page.keyboard.press('Escape');await waitScene('MainMenu');
  ok(await page.evaluate(async()=>{
    const {loadRun,isRunSave}=await import('/src/persistence/runSave.ts');const saved=loadRun();
    if(saved?.world.bear?.state.attack!=='slam'||saved.world.bear.state.phase!=='attack'||!saved.world.bear.state.enraged||!isRunSave(saved))return false;
    const bad=structuredClone(saved);bad.world.bear.state.health=-1;
    const missing=structuredClone(saved);delete missing.world.bear;
    const old=structuredClone(saved);old.layout.rooms[6].scenario='empty';delete old.world.bear;
    const invalidRage=structuredClone(saved);invalidRage.world.bear.state.enraged='yes';
    const legacy=structuredClone(saved);delete legacy.world.bear.state.enraged;legacy.world.bear.state.runSpeed=117.33333333333334;
    return !isRunSave(bad)&&!isRunSave(missing)&&!isRunSave(invalidRage)&&isRunSave(old)&&isRunSave(legacy);
  }),'Сейв хранит атаку медведя и её время; повреждённые данные отвергаются, прежняя пустая комната остаётся совместимой');
  await click('MainMenu','continue-run');await waitScene('Room');
  ok(await page.evaluate(()=>{const b=window.__smokeGame.scene.getScene('Room').world.bear;return b.actorState.phase==='attack'&&b.actorState.attack==='slam'&&b.actorState.enraged&&b.actorState.elapsed>=350&&b.actorState.elapsed<450&&b.actorState.health===5;}),
    '«Продолжить» восстанавливает тот же замах медведя, не создавая нового спящего врага');
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),b=s.world.bear;
    s.physics.pause();b.setActive(true);b.body.enable=true;
    const {bearDuration}=await import('/src/rendering/bearArt.ts');
    b.updateBehavior(bearDuration('slam')-b.actorState.elapsed+1);
    if(b.actorState.phase!=='walk'||b.actorState.enraged)return false;
    const legacy=b.snapshot();delete legacy.state.enraged;legacy.state.runSpeed=117.33333333333334;legacy.state.phase='run';
    b.restore(legacy);b.updateBehavior(0);
    return !b.actorState.enraged&&b.actorState.phase==='walk'&&Math.abs(b.actorState.runSpeed-146.6666666667)<.001;
  }),'После сохранённого замаха снова шаг; старые сейвы переходят на спокойную погоню с новой базовой скоростью бега');
  ok(await page.evaluate(async arena=>{
    const s=window.__smokeGame.scene.getScene('Room'),b=s.world.bear;s.physics.pause();b.setActive(true).setVisible(true);b.body.enable=true;
    b.body.reset(arena.x,arena.y);b.body.updateFromGameObject();const {AcornProjectile}=await import('/src/entities/AcornProjectile.ts');
    for(let i=1;i<=5;i++){
      const body=b.body,shot=new AcornProjectile(s,s.player,body.x-40,body.center.y,{x:1,y:0});s.acorns.shots.push(shot);
      shot.body.reset(body.right+40,body.center.y);shot.body.updateFromGameObject();s.acorns.update(0);
      if(b.actorState.health!==5-i||!!shot.scene)return false;
    }
    const old=b;s.world.update(10000);
    return b===old&&b.actorState.phase==='dead'&&!b.body.enable&&b.visible&&b.texture.key.startsWith('bear-sleep-');
  },arena),'Пять настоящих желудей снимают 5 HP: медведь побеждён, лежит без коллизии и не возрождается');
  await page.keyboard.press('Escape');await waitScene('MainMenu');await click('MainMenu','continue-run');await waitScene('Room');
  ok(await page.evaluate(()=>{const b=window.__smokeGame.scene.getScene('Room').world.bear;return b.dying&&!b.body.enable&&b.actorState.phase==='dead';}),
    'Победа над медведем сохраняется через меню; погибший медведь не просыпается снова');
  const old=await page.evaluateHandle(seed=>{const s=window.__smokeGame.scene.getScene('Room'),b=s.world.bear;window.__oldBear=b;s.scene.restart({seed});return b;},seed);
  await page.waitForFunction(b=>window.__smokeGame.scene.getScene('Room').world.bear!==b,old);await old.dispose();await waitScene('Room');
  ok(await page.evaluate(()=>{const b=window.__smokeGame.scene.getScene('Room').world.bear;return b.actorState.phase==='sleep'&&b.actorState.health===5&&!window.__oldBear.scene&&!window.__oldBear.shadow.scene;}),
    'Новая локация создаёт одного здорового спящего медведя и удаляет старый рисунок/тень/коллизии');
}
