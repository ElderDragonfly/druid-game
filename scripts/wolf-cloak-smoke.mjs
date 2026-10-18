/** Check the asymmetric cloak through actual Arcade collisions and wolf impacts. */
export async function testWolfCloak(page, ok) {
  const old = await page.evaluateHandle(() => {
    const s=window.__smokeGame.scene.getScene('Room'), old=s.player;
    s.scene.restart({seed:0});return old;
  });
  await page.waitForFunction(old=>{
    const s=window.__smokeGame.scene.getScene('Room');
    return s.player!==old && s.world?.wolf?.body?.enable &&
      s.physics.world.colliders.getActive().length===s.world.mice.length+3;
  },old);await old.dispose();
  const bounds = await page.evaluate(async()=>{
    const {wolfContactBounds}=await import('/src/physics/wolfContact.ts');
    const {CHARACTERS}=await import('/src/data/characters.ts');
    const {WolfBehavior}=await import('/src/behavior/WolfBehavior.ts');
    const s=window.__smokeGame.scene.getScene('Room'),nav=s.world.wolf.behavior.navigation;
    let fixture;
    for(let y=250;y<1900&&!fixture;y+=100)for(let x=250;x<3500&&!fixture;x+=100){
      let free=true;
      for(let dy=-150;dy<=150&&free;dy+=12)for(let dx=-150;dx<=150&&free;dx+=12)
        if(!nav.canStand({x:x+dx,y:y+dy}))free=false;
      if(free)fixture={x,y};
    }
    if(!fixture)throw new Error('No clear cloak contact fixture');
    window.__cloakFixture=fixture;
    const body={x:390,y:275,width:20,height:25};
    const rect=wolfContactBounds(body,CHARACTERS[0].game.wolfContactPadding);
    const ai=new WolfBehavior(nav,fixture);
    return rect.x===372 && rect.width===44 && rect.y===275 && rect.height===25 &&
      ai.inAttackRange({x:340,y:300},rect) && !ai.inAttackRange({x:339.8,y:300},rect) &&
      ai.inAttackRange({x:448,y:300},rect) && !ai.inAttackRange({x:448.2,y:300},rect) &&
      ai.inAttackRange({x:400,y:270},rect) && !ai.inAttackRange({x:400,y:269.8},rect) &&
      ai.inAttackRange({x:400,y:323},rect) && !ai.inAttackRange({x:400,y:323.2},rect);
  });
  ok(bounds,'Граница плаща 44×25: +18 слева, +6 справа; верх/низ и пределы удара по вертикали прежние');
  for(const [side,key,dx,dy,expected] of [
    ['left','a',-100,0,18],['right','d',100,0,6],['up','w',0,-100,0],['down','s',0,100,0],
  ]){
    await page.evaluate(({dx,dy})=>{
      const s=window.__smokeGame.scene.getScene('Room'),p=s.player,w=s.world.wolf,f=window.__cloakFixture;
      p.cancelHit();p.cancelCast();p.setVelocity(0,0);p.body.reset(f.x,f.y-22.5);
      w.setActive(false).setVelocity(0,0);w.body.enable=true;w.body.reset(f.x+dx,f.y+dy);
    },{dx,dy});
    await page.keyboard.down(key);await page.waitForTimeout(760);await page.keyboard.up(key);
    const result=await page.evaluate(side=>{
      const s=window.__smokeGame.scene.getScene('Room'),p=s.player.body,w=s.world.wolf.body,f=window.__cloakFixture;
      const gaps={left:p.x-w.right,right:w.x-p.right,up:p.y-w.bottom,down:w.y-p.bottom};
      return {gap:gaps[side],base:p.width===20&&p.height===25,
        perpendicular:Math.abs(['left','right'].includes(side)?p.bottom-f.y:p.center.x-f.x),health:s.playerHealth};
    },side);
    ok(Math.abs(result.gap-expected)<.25&&result.base&&result.perpendicular<.25&&result.health===3,
      `Реальная коллизия ${side}: волк не пропускает друида, зазор ${expected}, базовое тело 20×25 и HP сохранены`);
  }
  await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),p=s.player,w=s.world.wolf,f=window.__cloakFixture;
    p.cancelHit();p.setVelocity(0,0);p.body.reset(f.x,f.y-22.5);
    // At x-55 the wolf touches the cloak but is outside the old x-42 hit range.
    w.body.reset(f.x-55,f.y);w.setActive(true);w.actorState.alerted=true;
    w.actorState.phase='chase';w.actorState.elapsed=0;
    window.__cloakPlayerX=p.x;
  });
  await page.waitForFunction(()=>window.__smokeGame.scene.getScene('Room').player.hitReaction.active,null,{timeout:2500});
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),w=s.world.wolf;
    return s.playerHealth===3 && Math.abs(s.player.x-window.__cloakPlayerX)<.25 &&
      w.actorState.phase==='attack' && w.actorState.elapsed>=240 && w.actorState.elapsed<500;
  }),'Волк попадает по левому краю плаща за пределами прежнего тела, в активной фазе, без урона и отбрасывания');
}
