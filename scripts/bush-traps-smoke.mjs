/** Warning, non-physical swept damage, sanctuary, persistence and cleanup. */
export async function testBushTraps(page,ok,waitScene){
  ok(await page.evaluate(async()=>{
    const {bushTrapRoute,routeLength}=await import('/src/world/bushTrapRoutes.ts');
    const {segmentTouchesEllipse}=await import('/src/physics/ellipse.ts');
    const center={x:640,y:1080};
    for(let i=0;i<48;i++){
      const a=i*Math.PI/24,from={x:center.x+Math.cos(a)*250,y:center.y+Math.sin(a)*180};
      const to={x:center.x-Math.cos(a)*250,y:center.y-Math.sin(a)*180};
      const path=bushTrapRoute(from,to,center);
      if(path.length<3||routeLength(path)>800||path.slice(1).some((p,j)=>segmentTouchesEllipse(path[j],p,center,88,64)))return false;
    }
    return true;
  }),'48 пересекающих центр маршрутов обходят безопасный овал целиком, включая повороты');
  ok(await page.evaluate(async()=>{
    const {bushCenter}=await import('/src/world/bushTrapRoutes.ts');
    const s=window.__smokeGame.scene.getScene('Room'),t=s.world.bushTraps;
    s.physics.pause();
    window.__trapPlace=p=>{const b=s.player.body;s.player.body.reset(s.player.x+p.x-b.center.x,s.player.y+p.y-b.center.y);b.updateFromGameObject();};
    window.__trapStep=ms=>{t.enabled=true;t.update(ms);t.enabled=false;};
    window.__trapPlace(s.layout.witchCircle);
    const sizes=new Set();
    for(let i=0;i<60;i++){
      t.restore({wave:i,waitMs:0,runners:[]});t.startWave();sizes.add(t.runners.length);
      if(t.runners.length<2||t.runners.length>3)return false;
    }
    t.restore({wave:0,waitMs:0,runners:[]});t.startWave();
    const r=t.snapshot().runners[0];window.__trapRunner=r;
    const source=bushCenter(s.layout.bushes[r.source]);window.__trapPlace(source);
    s.player.cancelHit();s.player.cancelCast();s.player.actorState.health=3;
    window.__trapStep(450);
    return sizes.has(2)&&sizes.has(3)&&s.playerHealth===3&&t.runners.every(r=>r.phase==='warning'&&!r.visual)&&
      t.runners.every(r=>s.world.bushes.foliage[r.source].frame.name.startsWith('rustle-'));
  }),'60 волн: одновременно 2–3 разных куста; шуршание заметно меняет кадр, до появления кружков урона нет');
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),t=s.world.bushTraps;
    window.__trapStep(449);if(s.playerHealth!==3||t.runners.some(r=>r.visual))return false;
    window.__trapStep(1);
    const r=t.runners.find(r=>r.source===window.__trapRunner.source),dot=r.visual;
    window.__trapStep(0);
    return s.playerHealth===2&&s.player.hitReaction.active&&r.phase==='moving'&&!!dot&&!dot.body&&
      dot.cameraFilter&s.hudCamera.id&&s.world.bushes.foliage[r.source].frame.name==='bush-2'&&
      Math.hypot(dot.x-r.path[0].x,dot.y-r.path[0].y)<.001;
  }),'900 мс предупреждения: кружок возникает в центре куста, сразу наносит 1 HP, без физического тела; повтор в том же кадре защищён реакцией попадания');
  ok(await page.evaluate(async()=>{
    const {routePosition}=await import('/src/world/bushTrapRoutes.ts');
    const s=window.__smokeGame.scene.getScene('Room'),t=s.world.bushTraps;
    t.restore({wave:1,waitMs:900,runners:[{...window.__trapRunner,phase:'moving',elapsed:900,distance:0}]});
    const r=t.runners[0],point=routePosition(r.path,80);
    window.__trapPlace(point);s.player.cancelHit();s.player.actorState.health=3;
    window.__trapStep(400);
    return s.playerHealth===2&&Math.abs(r.distance-220*2/3*2.2*.4)<.001&&
      Math.hypot(r.visual.x-routePosition(r.path,r.distance).x,r.visual.y-routePosition(r.path,r.distance).y)<.001;
  }),'Быстрый кружок наносит урон по всему пройденному отрезку даже за длинный кадр, скорость 2,2 без телепорта');
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),t=s.world.bushTraps,r=t.runners[0];
    const length=r.length;
    t.restore({wave:1,waitMs:900,runners:[{...window.__trapRunner,phase:'moving',elapsed:900,distance:length-1}]});
    const end=t.runners[0].path.at(-1),visual=t.runners[0].visual;
    window.__trapPlace(end);s.player.cancelHit();s.player.actorState.health=3;
    window.__trapStep(10);
    return s.playerHealth===2&&t.runners.length===0&&!visual.scene;
  }),'В центре конечного куста кружок ещё наносит урон, затем исчезает без остаточного коллайдера');
  ok(await page.evaluate(async()=>{
    const {bushTrapRoute,bushCenter}=await import('/src/world/bushTrapRoutes.ts');
    const {segmentTouchesEllipse}=await import('/src/physics/ellipse.ts');
    const s=window.__smokeGame.scene.getScene('Room'),t=s.world.bushTraps,c=s.layout.witchCircle;
    let pair;
    for(let i=0;i<s.layout.bushes.length&&!pair;i++)for(let j=i+1;j<s.layout.bushes.length;j++){
      const a=bushCenter(s.layout.bushes[i]),b=bushCenter(s.layout.bushes[j]);
      if(segmentTouchesEllipse(a,b,c,72,48)&&bushTrapRoute(a,b,c).length>2){pair={source:i,target:j,phase:'moving',elapsed:900,distance:0};break;}
    }
    if(!pair)return false;
    t.restore({wave:2,waitMs:900,runners:[pair]});window.__trapPlace(c);s.player.cancelHit();s.player.actorState.health=3;
    window.__trapStep(10000);
    return s.playerHealth===3&&t.runners.length===0;
  }),'Друид в ведьмином овале безопасен: большой шаг времени не срезает обход и не наносит урон через центр');
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),t=s.world.bushTraps;
    const {isRunSave,saveRun,loadRun}=await import('/src/persistence/runSave.ts');
    t.restore({wave:3,waitMs:1000,runners:[{...window.__trapRunner,phase:'warning',elapsed:300,distance:0}]});
    const save={version:1,savedAt:Date.now(),characterId:'druid',layout:structuredClone(s.layout),player:s.player.snapshot(),
      camera:{...s.cameraFollow.center},world:s.world.snapshot(),shots:[]};
    const old=structuredClone(save);delete old.world.bushTraps;old.layout.bushes.forEach((b,i)=>b.variant=i%8);
    const bad=structuredClone(save);bad.world.bushTraps.runners[0].distance=NaN;
    const same=structuredClone(save);same.world.bushTraps.runners[0].target=same.world.bushTraps.runners[0].source;
    saveRun(save);const loaded=loadRun();window.__trapSaved=save;
    return isRunSave(save)&&isRunSave(old)&&!isRunSave(bad)&&!isRunSave(same)&&
      JSON.stringify(loaded.world.bushTraps)===JSON.stringify(save.world.bushTraps);
  }),'Сохранение хранит предупреждение и прогресс волны, принимает старые восемь видов и отвергает повреждённые маршруты');
  const previous=await page.evaluateHandle(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),world=s.world;s.scene.restart({savedRun:window.__trapSaved});return world;
  });
  await page.waitForFunction(w=>window.__smokeGame.scene.getScene('Room').world!==w,previous);await waitScene('Room');
  ok(await page.evaluate(old=>{
    const s=window.__smokeGame.scene.getScene('Room'),t=s.world.bushTraps;
    delete window.__trapPlace;delete window.__trapStep;delete window.__trapSaved;delete window.__trapRunner;
    return t.runners.length===1&&t.runners[0].phase==='warning'&&t.runners[0].elapsed>=300&&t.runners[0].elapsed<450&&
      old.bushTraps.runners.length===0&&old.bushes.foliage.every(image=>!image.scene);
  },previous),'Продолжение восстанавливает шуршащий куст, прежняя сцена удаляет ловушки и листву без дубликатов');
  await previous.dispose();
  const before=await page.evaluateHandle(()=>{const s=window.__smokeGame.scene.getScene('Room'),w=s.world;s.scene.restart({seed:s.layout.seed});return w;});
  await page.waitForFunction(w=>window.__smokeGame.scene.getScene('Room').world!==w,before);await waitScene('Room');await before.dispose();
  ok(await page.evaluate(()=>{const t=window.__smokeGame.scene.getScene('Room').world.bushTraps;return t.runners.length===0&&t.snapshot().wave===0;}),
    'Новый забег начинает ловушки заново; ожидание вне левой комнаты не запускает скрытых волн');
}
