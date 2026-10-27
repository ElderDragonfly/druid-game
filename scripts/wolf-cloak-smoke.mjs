import { isolateSingleWolf } from './wolf-fixture.mjs';
/** Check the asymmetric cloak through actual Arcade collisions and wolf impacts. */
export async function testWolfCloak(page, ok) {
  const old = await page.evaluateHandle(() => {
    const s=window.__smokeGame.scene.getScene('Room'), old=s.player;
    s.scene.restart({seed:0});return old;
  });
  await page.waitForFunction(old=>{
    const s=window.__smokeGame.scene.getScene('Room');
    return s.player!==old && s.world?.wolves?.[0]?.body?.enable &&
      s.physics.world.colliders.getActive().length===s.world.mice.length+2+s.world.wolves.length*2+(s.world.bear&&!s.world.bear.dying?2:0)+s.world.skeletons.filter(e=>!e.dying).length*2;
  },old);await old.dispose();await isolateSingleWolf(page);
  const bounds = await page.evaluate(async()=>{
    const {wolfContactBounds}=await import('/src/physics/wolfContact.ts');
    const {CHARACTERS}=await import('/src/data/characters.ts');
    const {WolfBehavior}=await import('/src/behavior/WolfBehavior.ts');
    const s=window.__smokeGame.scene.getScene('Room'),nav=s.world.wolves[0].behavior.navigation;
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
    return rect.x===380 && rect.width===36 && rect.y===275 && rect.height===25 &&
      ai.inAttackRange({x:348,y:300},rect) && !ai.inAttackRange({x:347.8,y:300},rect) &&
      ai.inAttackRange({x:448,y:300},rect) && !ai.inAttackRange({x:448.2,y:300},rect) &&
      ai.inAttackRange({x:400,y:270},rect) && !ai.inAttackRange({x:400,y:269.8},rect) &&
      ai.inAttackRange({x:400,y:323},rect) && !ai.inAttackRange({x:400,y:323.2},rect);
  });
  ok(bounds,'Граница плаща 36×25: +10 слева, +6 справа; верх/низ и пределы удара по вертикали прежние');
  for(const [side,key,dx,dy,expected] of [
    ['left','a',-100,0,10],['right','d',100,0,6],['up','w',0,-100,0],['down','s',0,100,0],
  ]){
    await page.evaluate(({dx,dy})=>{
      const s=window.__smokeGame.scene.getScene('Room'),p=s.player,w=s.world.wolves[0],f=window.__cloakFixture;
      p.cancelHit();p.cancelCast();p.setVelocity(0,0);p.body.reset(f.x,f.y-22.5);
      w.setActive(false).setVelocity(0,0);w.body.enable=true;w.body.reset(f.x+dx,f.y+dy);
    },{dx,dy});
    await page.keyboard.down(key);await page.waitForTimeout(760);await page.keyboard.up(key);
    const result=await page.evaluate(side=>{
      const s=window.__smokeGame.scene.getScene('Room'),p=s.player.body,w=s.world.wolves[0].body,f=window.__cloakFixture;
      const gaps={left:p.x-w.right,right:w.x-p.right,up:p.y-w.bottom,down:w.y-p.bottom};
      return {gap:gaps[side],base:p.width===20&&p.height===25,
        perpendicular:Math.abs(['left','right'].includes(side)?p.bottom-f.y:p.center.x-f.x),health:s.playerHealth};
    },side);
    ok(Math.abs(result.gap-expected)<.25&&result.base&&result.perpendicular<.25&&result.health===3,
      `Реальная коллизия ${side}: волк не пропускает друида, зазор ${expected}, базовое тело 20×25 и HP сохранены`);
  }
  await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),p=s.player,w=s.world.wolves[0],f=window.__cloakFixture;
    p.cancelHit();p.setVelocity(0,0);p.body.reset(f.x,f.y-22.5);
    // Let the wolf approach naturally so the visible nose/staff gap can be checked.
    p.actorState.facing='left';p.updateAppearance(true);
    w.body.reset(f.x-160,f.y);w.setActive(true);w.actorState.alerted=true;
    w.actorState.phase='chase';w.actorState.elapsed=0;
    window.__cloakPlayerX=p.x;
  });
  await page.waitForFunction(()=>{const w=window.__smokeGame.scene.getScene('Room').world.wolves[0];return w.actorState.phase==='attack'&&w.actorState.elapsed<160;},null,{timeout:2500});
  const nose = await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),p=s.player,w=s.world.wolves[0];
    const c=document.createElement('canvas').getContext('2d');c.canvas.width=256;c.canvas.height=320;
    const f=w.frame;c.drawImage(w.texture.getSourceImage(),f.cutX,f.cutY,128,112,0,0,128,112);
    const pixels=c.getImageData(0,0,128,112).data;let noseX=0,noseY=0;
    for(let y=0;y<112;y++)for(let x=80;x<128;x++)if(pixels[(y*128+x)*4+3]>128&&x>=noseX){noseX=x;noseY=y;}
    const worldY=w.y+(noseY-w.displayOriginY)*w.scaleY;
    const sy=Math.round((worldY-p.y)/p.scaleY+p.displayOriginY);
    c.clearRect(0,0,256,320);c.drawImage(p.texture.getSourceImage(),p.frame.cutX,p.frame.cutY,256,320,0,0,256,320);
    const actor=c.getImageData(0,0,256,320).data;let staff=128;
    for(let y=sy-2;y<=sy+2;y++)for(let x=0;x<128;x++)if(actor[(y*256+x)*4+3]>128)staff=Math.min(staff,x);
    const gap=p.x+(staff-p.displayOriginX)*p.scaleX-(w.x+(noseX-w.displayOriginX)*w.scaleX);
    return {gap,noseX,noseY,staff,sy,texture:w.texture.key,frame:w.frame.name,px:p.x,wx:w.x};
  });
  await page.screenshot({path:'test-results/wolf-staff-contact.png'});
  ok(nose.gap>=0&&nose.gap<=6,`При естественном подходе слева нос атакующего волка находится в 0–6 игровых пикселях от посоха на той же высоте: ${JSON.stringify(nose)}`);
  await page.waitForFunction(()=>window.__smokeGame.scene.getScene('Room').player.hitReaction.active,null,{timeout:2500});
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),w=s.world.wolves[0];
    return s.playerHealth===2 && Math.abs(s.player.x-window.__cloakPlayerX)<.25 &&
      w.actorState.phase==='attack' && w.actorState.elapsed>=240 && w.actorState.elapsed<500;
  }),'Волк попадает по левому краю плаща за пределами прежнего тела, в активной фазе, снимает 1 HP без отбрасывания');
}
