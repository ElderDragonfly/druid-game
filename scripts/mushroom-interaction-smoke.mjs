/** Actual E input, distance, one pickup per press and persistence through the menu. */
export async function testMushroomInteraction(page,ok,click,waitScene) {
  const count=()=>page.evaluate(()=>window.__smokeGame.scene.getScene('Room').layout.logs.reduce((sum,l)=>sum+l.mushrooms.length,0));
  const start=await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room');s.physics.pause();
    return {seed:s.layout.seed,health:s.playerHealth,total:s.layout.logs.reduce((n,l)=>n+l.mushrooms.length,0)};
  });
  await page.keyboard.press('e');
  ok(await count()===start.total,'E вдали от брёвен не убирает грибы');
  const target=await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),{mushroomPoint}=await import('/src/world/fallenLogs.ts');
    const bodies=s.world.obstacles.getChildren().map(o=>o.body);
    for(const [logIndex,log] of s.layout.logs.entries()) for(const m of log.mushrooms) {
      const p=mushroomPoint(log,m);
      for(let step=0;step<16;step++) {
        const a=step*Math.PI/8,c={x:p.x+Math.cos(a)*40,y:p.y+Math.sin(a)*40};
        const clear=!bodies.some(b=>c.x-10<b.right&&c.x+10>b.x&&c.y-12.5<b.bottom&&c.y+12.5>b.y);
        if(!clear)continue;
        s.player.body.reset(c.x,c.y-10);s.player.body.updateFromGameObject();
        const center=s.player.body.center;
        const near=s.layout.logs.flatMap((l,i)=>l.mushrooms.map(m=>({logIndex:i,slot:m.slot,p:mushroomPoint(l,m)})))
          .map(m=>({...m,d:Math.hypot(m.p.x-center.x,m.p.y-center.y)})).filter(m=>m.d<=44).sort((a,b)=>a.d-b.d);
        if(near.length)return {...near[0],withoutContact:!s.physics.overlap(s.player,s.world.obstacles)};
      }
    }
  });
  ok(!!target&&target.withoutContact,'К грибам можно подойти в радиус сбора без соприкосновения с коллайдером бревна');
  await page.keyboard.down('e');await page.waitForTimeout(80);
  ok(await count()===start.total-1&&await page.evaluate(t=>{
    const s=window.__smokeGame.scene.getScene('Room');
    return !s.layout.logs[t.logIndex].mushrooms.some(m=>m.slot===t.slot)&&
      !s.children.getByName(`log-mushroom-${t.logIndex}-${t.slot}`)&&s.hud.list.length===4;
  },target),'E убирает один ближайший гриб и его спрайт, без счётчиков и инвентаря');
  await page.keyboard.down('e');await page.waitForTimeout(250);await page.keyboard.up('e');
  ok(await count()===start.total-1,'Удержание E и повторный keydown не собирают остальные грибы');
  await page.keyboard.press('Escape');await waitScene('MainMenu');
  ok(await page.evaluate(async()=>{
    const {loadRun}=await import('/src/persistence/runSave.ts');const saved=loadRun();
    return !!saved&&saved.layout.logs.every(l=>l.mushrooms.every(m=>m.surface));
  }),'Сохранение хранит оставшиеся грибы и их случайные позиции');
  await click('MainMenu','continue-run');await waitScene('Room');
  ok(await count()===start.total-1&&await page.evaluate(t=>{
    const s=window.__smokeGame.scene.getScene('Room');s.physics.pause();
    return !s.children.getByName(`log-mushroom-${t.logIndex}-${t.slot}`);
  },target),'После «Продолжить» собранный гриб не восстанавливается');
  const remaining=await count();
  await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').gameOver=true);
  await page.keyboard.press('e');
  ok(await count()===remaining,'На экране завершённой игры E не собирает грибы');
  // Restore a clean seed for the existing world/creature scenarios.
  const old=await page.evaluateHandle(seed=>{const s=window.__smokeGame.scene.getScene('Room'),p=s.player;s.scene.restart({seed});return p;},start.seed);
  await page.waitForFunction(p=>{const s=window.__smokeGame.scene.getScene('Room');return s.player!==p&&s.world?.layout===s.layout;},old);
  await old.dispose();await waitScene('Room');
}
