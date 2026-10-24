/** Shared Arcade collision behavior, layered tree pixels and vertical wingbeats. */
export async function testEnemyCollisions(page,ok,waitScene) {
  const seed=await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').layout.seed);
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room');
    for(const state of ['corrupted','cleansed']) {
      const source=new Image();source.src=`/docs/art/cleansing-tree-v1/${state}.png`;await source.decode();
      const canvas=document.createElement('canvas');canvas.width=100;canvas.height=125;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);
      const original=ctx.getImageData(0,0,100,125).data;
      const key=state==='cleansed'?'ritual-tree-cleansed':'ritual-tree-corrupted';
      const read=key=>{ctx.clearRect(0,0,100,125);ctx.drawImage(s.textures.get(key).getSourceImage(),0,0);return ctx.getImageData(0,0,100,125).data;};
      const wood=read(key),ground=read(key+'-ground');let grass=0;
      for(let i=0;i<original.length;i+=4){
        if(wood[i+3]&&ground[i+3])return false;
        if(ground[i+3])grass++;
        for(let j=0;j<4;j++)if(original[i+j]!==wood[i+j]+ground[i+j])return false;
      }
      if(grass<500)return false;
    }
    return s.world.cleansing.tree.ground.depth<s.player.depth&&
      !!(s.world.cleansing.tree.ground.cameraFilter&s.hudCamera.id);
  }),'Оба дерева собираются из слоёв пиксель в пиксель; зелёная подстилка ниже друида и исключена из HUD');
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),{insectDurations}=await import('/src/rendering/forestInsectArt.ts');
    return insectDurations('fly').length===8&&insectDurations('attack').length===8&&
      insectDurations('death').length===11&&insectDurations('death').reduce((a,b)=>a+b,0)===1100&&
      !s.textures.exists('insect-attack-up')&&!s.textures.exists('insect-attack-down')&&
      s.textures.get('insect-fly').getSourceImage().width===64*8;
  }),'Новая GIF: полёт 8 кадров, атака 8, смерть 11; верхних/нижних ракурсов больше нет');
  const arena=await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room');s.physics.resume();s.world.cleansing.tree.completeInteraction();
    const all=[...s.world.wolves,...s.world.cleansing.enemies,...(s.world.bear?[s.world.bear]:[])];
    all.forEach(e=>{e.updateBehavior=()=>{};e.setActive(true);e.body.enable=false;e.setVelocity(0,0);});
    s.player.body.enable=false;s.world.mice.forEach(e=>e.body.enable=false);
    const {WolfNavigation}=await import('/src/world/WolfNavigation.ts');const nav=new WolfNavigation(s.layout,{width:60,height:35});
    for(let y=200;y<s.layout.height-200;y+=70)for(let x=250;x<s.layout.width-250;x+=70)
      if(nav.clear({x:x-180,y},{x:x+180,y})&&nav.clear({x,y:y-140},{x,y:y+140}))return {x,y};
    throw new Error('Нет открытого места для проверки столкновений');
  });
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),all=[...s.world.wolves,...s.world.cleansing.enemies,...(s.world.bear?[s.world.bear]:[])];
    return s.world.enemyCollisions.group.getChildren().length===all.length&&all.every(e=>
      s.world.enemyCollisions.group.contains(e)&&e.body.collideWorldBounds&&!e.body.pushable);
  }),'В одном физическом пуле находятся начальные волки и появившиеся позже мухи; регистрация сохраняет настройки тел');
  const counts=await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').world.wolves.length);
  for(const [name,pair] of [['волк/волк',[0,1]],['муха/муха',[counts,counts+1]],['волк/муха',[0,counts]]])for(const axis of ['x','y']) {
    await page.evaluate(({pair,axis,arena})=>{
      const s=window.__smokeGame.scene.getScene('Room'),all=[...s.world.wolves,...s.world.cleansing.enemies,...(s.world.bear?[s.world.bear]:[])];
      all.forEach(e=>{e.body.enable=false;e.setVelocity(0,0);});
      pair.forEach((id,i)=>{const e=all[id],sign=i?1:-1;e.body.enable=true;
        e.body.reset(arena.x+(axis==='x'?sign*75:0),arena.y+(axis==='y'?sign*75:0));
        e.setVelocity(axis==='x'?-sign*100:0,axis==='y'?-sign*100:0);});
    },{pair,axis,arena});
    await page.waitForTimeout(1300);
    ok(await page.evaluate(({pair,axis})=>{
      const s=window.__smokeGame.scene.getScene('Room'),all=[...s.world.wolves,...s.world.cleansing.enemies,...(s.world.bear?[s.world.bear]:[])],a=all[pair[0]].body,b=all[pair[1]].body;
      return axis==='x'?a.right<=b.left+.01&&b.left-a.right<1:a.bottom<=b.top+.01&&b.top-a.bottom<1;
    },{pair,axis}),`Настоящая физика ${name}: встречное движение по ${axis} останавливает обоих без пересечения`);
  }
  await page.evaluate(({arena,counts})=>{
    const s=window.__smokeGame.scene.getScene('Room'),all=[...s.world.wolves,...s.world.cleansing.enemies,...(s.world.bear?[s.world.bear]:[])];all.forEach(e=>{e.body.enable=false;e.setVelocity(0,0);});
    const dead=s.world.cleansing.enemies[0],live=s.world.wolves[0];dead.body.reset(arena.x,arena.y);dead.body.enable=true;dead.behavior.restoreFlight();dead.takeDamage(2);
    live.body.enable=true;live.body.reset(arena.x-75,arena.y);live.setVelocity(100,0);
  },{arena,counts});
  await page.waitForTimeout(1500);
  ok(await page.evaluate(arena=>{const s=window.__smokeGame.scene.getScene('Room');return s.world.wolves[0].x>arena.x+45&&!s.world.cleansing.enemies[0].body.enable;},arena),
    'Живой враг проходит через погибшего: труп остаётся, столкновение снято');
  const old=await page.evaluateHandle(seed=>{const s=window.__smokeGame.scene.getScene('Room'),p=s.player;window.__oldEnemyGroup=s.world.enemyCollisions.group;s.scene.restart({seed});return p;},seed);
  await page.waitForFunction(p=>window.__smokeGame.scene.getScene('Room').player!==p,old);await old.dispose();await waitScene('Room');
  ok(await page.evaluate(()=>{const s=window.__smokeGame.scene.getScene('Room');return !window.__oldEnemyGroup.scene&&s.world.enemyCollisions.group.getChildren().length===s.world.wolves.length+Number(!!s.world.bear);}),
    'Перезапуск удаляет старый физический пул, новых врагов не дублирует');
}
