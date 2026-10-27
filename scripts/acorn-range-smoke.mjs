/** Range stat, directional limits, physical landing and no damage past the limit. */
export async function testAcornRange(page,ok) {
  ok(await page.evaluate(async()=>{
    const{AcornFlight}=await import('/src/behavior/AcornFlight.ts');
    const{FACINGS,facingVector}=await import('/src/input/EightWayFacing.ts');
    return FACINGS.every(f=>{
      const d=facingVector(f),flight=new AcornFlight(d,1),distance=flight.maxDistance;
      return Math.abs((d.x*distance/384)**2+(d.y*distance/216)**2-1)<1e-9&&
        Math.abs(new AcornFlight(d,2).maxDistance-distance*2)<1e-6;
    });
  }),'Дальность 1 задаёт овал 384×216 для всех восьми направлений; значение 2 увеличивает обе полуоси вдвое');
  ok(await page.evaluate(async()=>{
    const{AcornFlight}=await import('/src/behavior/AcornFlight.ts');
    const f=new AcornFlight({x:1,y:0},1),end=f.maxDistance,start=end-f.descentDistance;
    const h=[0,.25,.5,.75,1].map(t=>f.heightAt(start+(end-start)*t));
    return end===384&&f.descentDistance===55&&f.heightAt(start-1)===38&&h[0]===38&&h[4]===0&&
      h.every((v,i)=>!i||v<h[i-1])&&h[0]-h[1]<h[1]-h[2]&&h[1]-h[2]<h[2]-h[3]&&
      new AcornFlight({x:0,y:-1},0).heightAt(0)===0;
  }),'Последние 55 единиц (250 мс) дают ускоряющуюся дугу от высоты 38 до земли, строго внутри дальности');

  await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').scene.start('CharacterSelect'));
  await page.waitForFunction(()=>window.__smokeGame.scene.isActive('CharacterSelect'));
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('CharacterSelect'),{CHARACTERS}=await import('/src/data/characters.ts');
    const text=s.children.getByName('selection-description');
    return CHARACTERS[0].stats.range===1&&text.text.includes('Дальность: 1')&&text.getBounds().right<524;
  }),'В карточке друида показана Дальность: 1 из его определения; текст помещается в панели');
  await page.evaluate(()=>window.__smokeGame.scene.getScene('CharacterSelect').scene.start('Room',{seed:3}));
  await page.waitForFunction(()=>{
    const s=window.__smokeGame.scene.getScene('Room');return s.sys.isActive()&&s.layout.seed===3&&s.acorns;
  });
  await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),p=s.player;
    for(const tree of s.world.obstacles.getChildren())tree.body.enable=false;
    for(const e of s.world.skeletons){e.setActive(false).setVelocity(0,0);e.body.enable=false;}
    for(const m of s.world.mice){m.setActive(false).setVelocity(0,0);m.body.enable=false;}
    const{AcornAttack}=await import('/src/world/AcornAttack.ts');
    const{AcornProjectile}=await import('/src/entities/AcornProjectile.ts');
    s.acorns.destroy();window.__rangeTrace=[];
    s.acorns=new AcornAttack(s,p,Math.random,(from,to)=>window.__rangeTrace.push({...to}));
    const start={x:p.body.center.x,y:p.body.center.y};window.__rangeOrigin=start;
    const shot=new AcornProjectile(s,p,start.x,start.y,{x:1,y:0});s.acorns.shots.push(shot);
    window.__rangeShot=shot;
  });
  await page.waitForFunction(()=>{
    const shot=window.__rangeShot;return shot.scene&&shot.flight.distance>332;
  });
  const before=await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),shot=window.__rangeShot;
    return{height:shot.body.center.y-shot.visual.y,distance:shot.flight.distance,range:s.player.actorState.range};
  });
  await page.waitForTimeout(90);
  ok(await page.evaluate(before=>{
    const shot=window.__rangeShot;if(!shot.scene)return false;
    return before.range===1&&before.height>0&&before.height<38&&shot.flight.height<before.height&&
      Math.abs(shot.body.center.y-shot.visual.y-shot.flight.height)<1e-6&&shot.body.enable&&shot.flight.distance<384;
  },before),'Живой жёлудь быстро снижается в конце полёта; физическое тело остаётся на земле и сохраняет столкновения');
  await page.waitForFunction(()=>!window.__rangeShot.scene);
  ok(await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room'),trace=window.__rangeTrace,last=trace.at(-1),start=window.__rangeOrigin;
    return Math.abs(Math.hypot(last.x-start.x,last.y-start.y)-384)<1e-6&&s.acorns.shots.length===0&&
      s.acorns.leaves.length>0&&s.acorns.leaves.some(l=>l.height<38);
  }),'Жёлудь исчезает у земли на пределе 384; листья следуют дуге и продолжают затухать после приземления');

  const sweep=await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),p=s.player,start=window.__rangeOrigin;
    const{AcornProjectile}=await import('/src/entities/AcornProjectile.ts');
    s.physics.pause();
    let hits=0;
    const target=s.physics.add.image(start.x+404,start.y,'acorn').setSize(8,12).setImmovable(true);
    target.body.updateFromGameObject();target.takeDamage=()=>{hits++;return true;};
    const launch=(distance,dt=0)=>{
      const shot=new AcornProjectile(s,p,start.x,start.y,{x:1,y:0});s.acorns.shots.push(shot);
      shot.body.reset(start.x+distance,start.y);shot.body.updateFromGameObject();s.acorns.update(dt);return shot;
    };
    window.__rangeTrace=[];const missed=launch(700),last=window.__rangeTrace.at(-1);
    const beyond=!missed.scene&&hits===0&&Math.abs(last.x-start.x-384)<1e-6;
    target.body.reset(start.x+362,start.y);target.body.updateFromGameObject();
    const hit=launch(700),within=!hit.scene&&hits===1;
    target.destroy();
    p.actorState.range=3;const long=launch(950,4400);
    p.actorState.range=.5;const short=launch(0);
    const mutable=!!long.scene&&long.flight.maxDistance===1152&&long.ageMs===4400&&
      short.flight.maxDistance===192&&long.flight.maxDistance===1152;
    for(const shot of s.acorns.shots)shot.destroy();s.acorns.shots.length=0;
    p.actorState.range=0;const zero=launch(0);
    p.actorState.range=1;return{beyond,within,mutable,zero:!zero.scene};
  });
  ok(sweep.beyond&&sweep.within,'Длинный кадр не позволяет повредить или заметить объект за дальностью; попадание во время снижения работает');
  ok(sweep.mutable&&sweep.zero,'Изменяемая дальность действует на следующие выстрелы; большие значения не обрезаются старым лимитом 4 с, нулевая дальность удаляется сразу');
  await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').scene.restart({seed:0}));
  await page.waitForFunction(()=>{
    const s=window.__smokeGame.scene.getScene('Room');return s.layout.seed===0&&!s.physics.world.isPaused&&s.player.actorState.range===1;
  });
}
