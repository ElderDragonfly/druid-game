import {testRitualTreeCollision} from './ritual-tree-collision-smoke.mjs';
/** Actual room content, held interaction, four attack directions and saved waves. */
export async function testRoomScenarios(page,ok,click,waitScene) {
  ok(await page.evaluate(async()=>{
    const {generateMeadow}=await import('/src/world/meadowLayout.ts');
    const {roomAt,ritualTreeClearing}=await import('/src/world/rooms.ts');
    const {overlaps,obstacleVisualRect}=await import('/src/world/meadowLayout.ts');
    const {WolfNavigation}=await import('/src/world/WolfNavigation.ts');
    const {generateWolfPopulation}=await import('/src/world/wolfPopulation.ts');
    const {cleansingEnemySpawns}=await import('/src/world/CleansingEncounter.ts');
    const {FOREST_INSECT}=await import('/src/data/forestInsect.ts');
    const counts=new Set(),mushrooms=new Set();
    for(let seed=0;seed<100;seed++) {
      const l=generateMeadow(seed),room=l.rooms[7],area=ritualTreeClearing(room.tree),nav=new WolfNavigation(l);
      if(l.rooms.length!==9||l.rooms[4].scenario!=='empty'||l.rooms[8].scenario!=='wolves'||room.scenario!=='cleansing-tree')return false;
      if(l.rooms.filter(r=>r.scenario==='empty').length!==4||l.rooms[0].scenario!=='skeletons'||l.rooms[6].scenario!=='bear'||roomAt(l,l.stump)!==4)return false;
      if(l.logs.length<1||l.logs.length>2||l.logs.some(g=>roomAt(l,g)!==8))return false;
      const amount=l.logs.reduce((n,g)=>n+g.mushrooms.length,0);mushrooms.add(amount);if(amount>2)return false;
      const wolves=generateWolfPopulation(nav);counts.add(wolves.length);
      if(wolves.length<3||wolves.length>4||wolves.some(p=>roomAt(l,p)!==8))return false;
      if(l.obstacles.some(o=>overlaps(obstacleVisualRect(o),area,8)))return false;
      const enemyNav=new WolfNavigation(l,FOREST_INSECT.body),player={x:room.tree.x+65,y:room.tree.y};
      const enemies=cleansingEnemySpawns(l,room,enemyNav,player);
      if(enemies.length!==3||enemies.some(p=>roomAt(l,p)!==7||!enemyNav.canStand(p)))return false;
    }
    return counts.size===2&&mushrooms.size===3;
  }),'100 seed: центр без сценария, нижняя правая с 3–4 волками/1–2 брёвнами/0–2 грибами всего, нижняя центральная с деревом и местами для 3 врагов');
  const seed=await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').layout.seed);
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),tree=s.world.cleansing.tree;
    return tree.status==='dormant'&&s.world.cleansing.enemies.length===0&&s.children.getByName('room-grid')&&
      s.world.obstacles.getChildren().every(o=>o.getData('kind')!=='room-border')&&
      tree.image.texture.key==='ritual-tree-corrupted'&&tree.image.scaleX===2&&
      tree.image.texture.source[0].scaleMode===1&&(tree.image.cameraFilter&s.hudCamera.id);
  }),'Границы комнат — только линии без стен; дерево из отдельного 100×125 PNG, врагов до активации нет');
  await testRitualTreeCollision(page,ok);
  const pos=await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),t=s.layout.rooms[7].tree;
    s.physics.pause();s.player.body.reset(t.x+65,t.y-20);s.player.body.updateFromGameObject();
    return {x:s.player.x,y:s.player.y};
  });
  await page.keyboard.down('e');await page.waitForTimeout(300);await page.keyboard.up('e');await page.waitForTimeout(50);
  ok(await page.evaluate(()=>{const s=window.__smokeGame.scene.getScene('Room');return s.world.cleansing.tree.status==='dormant'&&s.world.cleansing.enemies.length===0&&s.holdInteraction.progress===0;}),
    'Короткое удержание E у дерева не создаёт врагов');
  await page.keyboard.down('e');await page.waitForFunction(()=>window.__smokeGame.scene.getScene('Room').world.cleansing.enemies.length===3);await page.keyboard.up('e');
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),c=s.world.cleansing;
    return c.tree.status==='active'&&c.tree.image.texture.key==='ritual-tree-corrupted'&&c.enemies.every(e=>
      e.actorState.health===2&&e.actorState.alerted&&Math.abs(e.actorState.runSpeed-220*2/3*.8)<.001&&!e.body.enable&&
      e.behavior.launching&&e.behavior.snapshotFlight().launchStart.y===s.layout.rooms[7].tree.y-150&&
      [e,e.shadow,e.airborne].every(o=>o.cameraFilter&s.hudCamera.id));
  }),'Секунда E выпускает из кроны 3 врагов: HP 2, скорость 0,8; до посадки физика выключена, анимация и тени не дублируются HUD');
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),p=s.player,e=s.world.cleansing.enemies[0];
    e.behavior.restoreFlight();
    const contact=p.wolfContactBounds,ground=p.body.bottom;
    for(const [direction,x,y] of [['right',contact.x-19,ground],['left',contact.x+contact.width+19,ground],
      ['down',p.body.center.x,p.body.y-3],['up',p.body.center.x,ground+21]]) {
      p.cancelHit();p.actorState.health=3;
      e.body.reset(x,y);e.body.updateFromGameObject();e.actorState.phase='chase';e.actorState.elapsed=0;e.attackConnected=false;
      e.updateBehavior(16);
      if(e.texture.key!=='insect-attack'||e.actorState.phase!=='attack')return false;
      e.updateBehavior(310);if(p.actorState.health!==2||!p.hitReaction.active)return false;
      e.updateBehavior(10);if(p.actorState.health!==2)return false;
    }
    p.cancelHit();p.heal(1);
    return true;
  }),'С любой стороны используются исходные кадры атаки, только с отражением: попадание в активной фазе, ровно 1 HP, без повторного урона за удар');
  const hit=async()=>page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),e=s.world.cleansing.enemies[0];
    const {AcornProjectile}=await import('/src/entities/AcornProjectile.ts');
    const nav=e.behavior.navigation,tree=s.layout.rooms[7].tree;
    for(let y=tree.y-130;y<=tree.y+130;y+=30)for(let x=tree.x-250;x<=tree.x+250;x+=40) {
      if(!nav.clear({x:x-60,y},{x:x+60,y}))continue;
      if(s.world.cleansing.enemies.slice(1).some(other=>Math.hypot(other.x-x,other.y-y)<90))continue;
      e.body.reset(x,y);e.body.updateFromGameObject();
      const body=e.body,shot=new AcornProjectile(s,s.player,body.x-20,body.center.y,{x:1,y:0});
      s.acorns.shots.push(shot);shot.body.reset(body.right+20,body.center.y);shot.body.updateFromGameObject();s.acorns.update(0);
      return {hp:e.actorState.health,reacting:e.hitElapsed!==null,enabled:e.body.enable,status:s.world.cleansing.tree.status};
    }
    throw new Error('Нет места для проверки желудя');
  });
  let damage=await hit();
  ok(damage.hp===1&&damage.reacting&&damage.enabled&&damage.status==='active','Настоящий жёлудь снимает 1 HP и приостанавливает насекомое, дерево пока не очищается');
  damage=await hit();
  ok(damage.hp===0&&!damage.enabled&&damage.status==='active','Второй жёлудь запускает смерть и снимает коллизию; два живых врага продолжают удерживать дерево осквернённым');
  await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').world.update(650));
  await page.keyboard.press('Escape');await waitScene('MainMenu');
  ok(await page.evaluate(async()=>{
    const {loadRun,isRunSave}=await import('/src/persistence/runSave.ts'),save=loadRun(),c=save?.world.cleansing;
    if(c?.status!=='active'||c.enemies.length!==3||c.enemies.filter(e=>e.state.health===0).length!==1)return false;
    const invalid=structuredClone(save);invalid.world.cleansing.enemies=[];
    const bad=structuredClone(save);bad.layout.rooms[7].scenario='wolves';
    return isRunSave(save)&&!isRunSave(invalid)&&!isRunSave(bad);
  }),'Сейв хранит активное очищение, 3 индивидуальных врагов и погибшего; повреждённые сценарии не загружаются');
  await click('MainMenu','continue-run');await waitScene('Room');
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room');s.physics.pause();const c=s.world.cleansing;
    return c.tree.status==='active'&&c.enemies.length===3&&c.enemies.filter(e=>e.dying).length===1;
  }),'«Продолжить» восстанавливает текущую волну, не создавая её заново');
  await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room');window.__cleanedEvents=0;s.events.once('tree-cleansed',()=>window.__cleanedEvents++);
    s.world.cleansing.enemies.filter(e=>!e.dying).forEach(e=>{e.behavior.restoreFlight();e.takeDamage(2);});s.world.update(1100);
  });
  ok(await page.evaluate(()=>{
    const c=window.__smokeGame.scene.getScene('Room').world.cleansing;
    return c.tree.status==='active'&&c.tree.image.texture.key.startsWith('ritual-tree-transition-');
  }),'После последней смерти дерево показывает промежуточный кадр роста, а не мгновенный готовый спрайт');
  await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').world.update(400));
  ok(await page.evaluate(()=>{
    const c=window.__smokeGame.scene.getScene('Room').world.cleansing;
    return c.tree.status==='cleansed'&&c.tree.image.texture.key==='ritual-tree-cleansed'&&
      c.enemies.every(e=>e.deathFinished&&!e.body.enable)&&window.__cleanedEvents===1;
  }),'После гибели всех врагов дерево меняет спрайт на живую листву, исходная смерть завершена, событие будущей награды испускается один раз');
  await page.keyboard.down('e');await page.waitForTimeout(1100);await page.keyboard.up('e');
  ok(await page.evaluate(()=>{const s=window.__smokeGame.scene.getScene('Room');return s.world.cleansing.enemies.length===3&&s.world.cleansing.tree.status==='cleansed'&&!s.holdIndicator.visible;}),
    'Очищенное дерево повторно не запускается');
  await page.keyboard.press('Escape');await waitScene('MainMenu');await click('MainMenu','continue-run');await waitScene('Room');
  ok(await page.evaluate(()=>{const c=window.__smokeGame.scene.getScene('Room').world.cleansing;return c.tree.status==='cleansed'&&c.tree.image.texture.key==='ritual-tree-cleansed'&&c.enemies.every(e=>e.dying);}),
    'Очищенный облик и погибшие враги сохраняются после выхода в меню');
  const old=await page.evaluateHandle(seed=>{const s=window.__smokeGame.scene.getScene('Room'),p=s.player;window.__oldInsects=[...s.world.cleansing.enemies];s.scene.restart({seed});return p;},seed);
  await page.waitForFunction(p=>window.__smokeGame.scene.getScene('Room').player!==p,old);await old.dispose();await waitScene('Room');
  ok(await page.evaluate(()=>{const c=window.__smokeGame.scene.getScene('Room').world.cleansing;return c.tree.status==='dormant'&&c.enemies.length===0&&window.__oldInsects.every(e=>!e.scene);}),
    'Новая поляна сбрасывает сценарий и удаляет старые тела/тени/коллайдеры');
}
