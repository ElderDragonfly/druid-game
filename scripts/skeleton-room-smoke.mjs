/** New room generation, real combat, save compatibility and scene cleanup. */
export async function testSkeletonRoom(page,ok,click,waitScene){
  if(await page.evaluate(()=>window.__smokeGame.scene.isActive('MainMenu'))){
    await click('MainMenu','play');await waitScene('CharacterSelect');
    await click('CharacterSelect','start-run');await waitScene('Room');
  }
  ok(await page.evaluate(async()=>{
    const {generateMeadow,obstacleVisualRect}=await import('/src/world/meadowLayout.ts');
    const {generateSkeletonPopulation,boneRect}=await import('/src/world/skeletonRoom.ts');
    const {roomBounds,roomAt}=await import('/src/world/rooms.ts');
    const {overlaps}=await import('/src/world/geometry.ts');
    const counts=new Set(),species=new Set();
    for(let seed=0;seed<100;seed++){
      const l=generateMeadow(seed),r=roomBounds(l,0),enemies=generateSkeletonPopulation(l);
      counts.add(enemies.length);l.bones.forEach(b=>species.add(b.variant));
      if(l.counts.trees<70||l.counts.trees>99||l.obstacles.some(t=>overlaps(obstacleVisualRect(t),r))||
        l.rooms[0].scenario!=='skeletons'||l.bones.length<24||l.bones.length>36||
        l.bones.some(b=>roomAt(l,b)!==0)||enemies.length<4||enemies.length>5||enemies.some(e=>roomAt(l,e)!==0)||
        JSON.stringify(l)!==JSON.stringify(generateMeadow(seed)))return false;
      if(l.bones.some((b,i)=>l.bones.slice(0,i).some(other=>overlaps(boneRect(b),boneRect(other),20))))return false;
    }
    return counts.size===2&&species.size===9;
  }),'100 seed: верхняя левая без деревьев/крон, 24–36 разнесённых костей девяти видов, 4–5 скелетов, детерминированная генерация');
  const restart=async seed=>{
    const old=await page.evaluateHandle(seed=>{const s=window.__smokeGame.scene.getScene('Room'),p=s.player;s.scene.restart({seed});return p;},seed);
    await page.waitForFunction(old=>window.__smokeGame.scene.getScene('Room').player!==old,old);await old.dispose();await waitScene('Room');
    await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').physics.pause());
  };
  await restart(0);
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room');
    return s.world.skeletons.length>=4&&s.world.skeletons.length<=5&&s.children.list.filter(o=>o.name==='forest-bones').length===s.layout.bones.length&&
      s.children.list.filter(o=>o.name==='forest-bones').every(o=>!o.body&&o.depth<s.player.depth&&(o.cameraFilter&s.hudCamera.id))&&
      s.world.skeletons.every(e=>s.world.enemyCollisions.group.contains(e)&&e.body.width===28&&e.body.height===18&&
        e.actorState.health===2&&Math.abs(e.actorState.runSpeed-220*2/3*.8)<.001&&
        (e.cameraFilter&s.hudCamera.id)&&(e.shadow.cameraFilter&s.hudCamera.id))&&
      ['idle','walk','attack'].every(n=>s.textures.get(`skeleton-${n}`).getFrameNames().length===16);
  }),'Исходные три цикла по 16 кадров загружены; кости проходимы, скелеты в общем пуле коллизий, слои не дублируются HUD');
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),e=s.world.skeletons[0],p=s.player;
    e.setActive(true).setVisible(true);e.body.enable=true;e.body.reset(500,300);e.body.updateFromGameObject();
    p.body.reset(700,300);p.body.updateFromGameObject();
    e.updateBehavior(16);
    if(!e.actorState.alerted||e.actorState.phase!=='chase'||e.body.velocity.length()<1)return false;
    e.body.reset(505,300);e.updateBehavior(40);
    if(e.texture.key!=='skeleton-walk'||e.flipX)return false;
    p.body.reset(300,300);p.body.updateFromGameObject();e.behavior.navigator.invalidate();e.updateBehavior(40);
    return e.flipX&&e.body.velocity.x<0&&e.actorState.health===2;
  }),'Обнаружение запускает погоню; при реальном смещении идут исходные шаги, при смене стороны используется отражение');
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),e=s.world.skeletons[0],p=s.player;
    p.cancelHit();p.actorState.health=3;p.body.reset(600,300);p.body.updateFromGameObject();
    const c=p.wolfContactBounds;
    e.body.reset(c.x-14-2,p.body.bottom);e.body.updateFromGameObject();
    e.actorState.phase='chase';e.actorState.elapsed=0;e.attackConnected=false;
    e.behavior.restoreTimers({idleMs:0,wanderMs:0,recoveryMs:0});
    e.updateBehavior(0);
    if(e.actorState.phase!=='attack'||e.texture.key!=='skeleton-attack')return false;
    e.updateBehavior(449);if(p.actorState.health!==3)return false;
    e.updateBehavior(2);if(p.actorState.health!==2)return false;
    e.updateBehavior(100);if(p.actorState.health!==2)return false;
    p.cancelHit();p.heal(1);
    e.takeDamage(1);e.updateBehavior(200);
    return e.actorState.health===1&&e.reactingToHit&&e.actorState.phase!=='attack'&&e.body.enable&&p.actorState.health===3;
  }),'Удар после замаха снимает ровно 1 HP; попадание в скелета прерывает атаку, не создавая отложенный удар');
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),e=s.world.skeletons[0];
    const {AcornProjectile}=await import('/src/entities/AcornProjectile.ts');
    e.body.reset(500,300);e.body.updateFromGameObject();
    const shot=new AcornProjectile(s,s.player,e.body.x-20,e.body.center.y,{x:1,y:0});
    s.acorns.shots.push(shot);shot.body.reset(e.body.right+20,e.body.center.y);shot.body.updateFromGameObject();s.acorns.update(0);
    e.updateBehavior(300);
    return e.dying&&!e.body.enable&&!e.visible&&!e.active&&s.acorns.shots.length===0&&e.snapshot().corpse;
  }),'Настоящий жёлудь добивает скелета; он исчезает и освобождает коллизию, респавна нет');
  await page.keyboard.press('Escape');await waitScene('MainMenu');
  ok(await page.evaluate(async()=>{
    const {loadRun,isRunSave}=await import('/src/persistence/runSave.ts');const save=loadRun();
    if(!save||save.world.skeletons[0].state.health!==0||!isRunSave(save))return false;
    const bad=structuredClone(save);bad.world.skeletons[0].state.health=-1;
    const missing=structuredClone(save);delete missing.world.skeletons;
    const badBone=structuredClone(save);badBone.layout.bones[0].variant=999;
    const old=structuredClone(save);delete old.world.skeletons;delete old.layout.bones;old.layout.rooms[0].scenario='empty';
    return !isRunSave(bad)&&!isRunSave(missing)&&!isRunSave(badBone)&&isRunSave(old);
  }),'Сейв сохраняет убитого скелета и кости, отвергает повреждённые данные и поддерживает старую пустую комнату');
  await click('MainMenu','continue-run');await waitScene('Room');
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room');s.physics.pause();
    return s.world.skeletons[0].dying&&!s.world.skeletons[0].body.enable&&!s.world.skeletons[0].visible;
  }),'Продолжение не воскрешает погибшего скелета');
  const old=await page.evaluateHandle(()=>window.__smokeGame.scene.getScene('Room').world.skeletons[0]);
  await restart(1);
  ok(await page.evaluate(old=>{
    const s=window.__smokeGame.scene.getScene('Room');
    return !old.scene&&s.children.list.filter(o=>o.name==='skeleton').length===s.world.skeletons.length&&
      s.children.list.filter(o=>o.name==='forest-bones').length===s.layout.bones.length;
  },old),'Перезапуск очищает прежние кости, врагов и коллайдеры без дубликатов');await old.dispose();
}
