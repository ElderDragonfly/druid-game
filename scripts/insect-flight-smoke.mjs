/** Launch arc, sine pursuit, peak pauses and save compatibility. */
export async function testInsectFlight(page,ok) {
  const result=await page.evaluate(async()=>{
    const {generateMeadow}=await import('/src/world/meadowLayout.ts');
    const {WolfNavigation}=await import('/src/world/WolfNavigation.ts');
    const {InsectFlight}=await import('/src/behavior/InsectFlight.ts');
    const {FOREST_INSECT}=await import('/src/data/forestInsect.ts');
    const {cleansingEnemySpawns}=await import('/src/world/CleansingEncounter.ts');
    const layout=generateMeadow(0),room=layout.rooms[7],nav=new WolfNavigation(layout,FOREST_INSECT.body);
    const tree=room.tree,player={x:tree.x+65,y:tree.y},points=cleansingEnemySpawns(layout,room,nav,player);
    let launches=true,arc=true;
    for(let i=0;i<3;i++) {
      const start={x:tree.x+(i-1)*36,y:tree.y-150},ai=new InsectFlight(nav,start,i+1);ai.launch(points[i],tree.y+1);
      let position={...start};
      const rect={x:player.x-10,y:player.y-18,width:20,height:18};
      let highest=0;
      for(let t=0;t<15000&&ai.launching;t+=20){const v=ai.step(20,position,player,rect);position={x:position.x+v.x*.02,y:position.y+v.y*.02};highest=Math.max(highest,ai.altitude);}
      arc&&=highest>140&&ai.altitude===0;
      launches&&=!ai.launching&&Math.hypot(position.x-points[i].x,position.y-points[i].y)<13;
    }
    // Empty arena isolates the flight shape from detours forced by tree trunks.
    const empty={...layout,obstacles:[],logs:[],rooms:undefined,stump:undefined};
    const flightNav=new WolfNavigation(empty,FOREST_INSECT.body),target={x:2600,y:950},rect={x:2590,y:932,width:20,height:18};
    const ai=new InsectFlight(flightNav,{x:1000,y:950},6);ai.alert();let p={x:1000,y:950};
    let pauses=0,moving=0,positive=false,negative=false,speeds=true,attack=false;const ys=[],pauseLengths=[];let peaks=true;let pauseLength=0;
    for(let t=0;t<30000;t+=20){
      const v=ai.step(20,p,target,rect),speed=Math.hypot(v.x,v.y);
      if(ai.actorState.phase==='attack'){attack=true;break;}
      if(speed<.01){pauses++;pauseLength+=20;const f=ai.snapshotFlight();peaks&&=Math.abs(Math.cos(f.wavePhase))<.001;}else {moving++;if(pauseLength){pauseLengths.push(pauseLength);pauseLength=0;}positive||=v.y>10;negative||=v.y< -10;speeds&&=speed<=FOREST_INSECT.stats.runSpeed+.001;}
      p={x:p.x+v.x*.02,y:p.y+v.y*.02};ys.push(p.y);
    }
    const s=window.__smokeGame.scene.getScene('Room');s.world.cleansing.tree.completeInteraction();
    const e=s.world.cleansing.enemies[0],saved=e.snapshot();
    e.behavior.restoreFlight();e.restore(saved);
    const preserved=JSON.stringify(e.behavior.snapshotFlight())===JSON.stringify(saved.flight);
    const snapshot={version:1,savedAt:Date.now(),characterId:s.characterId,layout:s.layout,player:s.player.snapshot(),camera:{...s.cameraFollow.center},world:s.world.snapshot(),shots:s.acorns.snapshot()},{isRunSave}=await import('/src/persistence/runSave.ts');
    const valid=isRunSave(snapshot),bad=structuredClone(snapshot);bad.world.cleansing.enemies[0].flight.pauseMs=-1;
    return {launches,arc,peaks,spread:points.every(p=>Math.hypot((p.x-tree.x)/480,(p.y-tree.y)/270)>=.69),
      positive,negative,pauses,moving,speeds,attack,pauseLengths,preserved,valid,rejectBad:!isRunSave(bad)};
  });
  ok(result.launches&&result.spread&&result.arc,'Три мухи разлетаются в овале 960×540: дуга поднимается и опускается, при приземлении высота нулевая');
  ok(result.positive&&result.negative&&result.moving>100&&result.speeds&&result.attack,
    'Погоня отклоняется в обе стороны, сохраняет скорость 0,8 и доводит врага до настоящей атаки');
  ok(result.pauses>0&&result.peaks&&result.pauseLengths.every(t=>t>=500&&t<=540),'Мухи зависают ровно на вершинах волны примерно по 0,5 секунды и продолжают погоню');
  ok(result.preserved&&result.valid&&result.rejectBad,'Полёт из кроны и фаза волны входят в сохранение; повреждённые таймеры отвергаются');
}

/** A real swept acorn passes beneath a launch, but hits the same body on landing. */
export async function testAirborneAcorn(page,ok) {
  const result=await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),c=s.world.cleansing;
    s.physics.pause();s.player.body.enable=false;
    [...s.world.wolves,...s.world.mice,...c.enemies].forEach(e=>{e.body.enable=false;e.setVelocity(0,0);});
    const e=c.enemies[0],nav=e.behavior.navigation,tree=c.tree.image;
    let start;
    for(let y=tree.y-150;y<=tree.y+150&&!start;y+=30)for(let x=tree.x-250;x<=tree.x+250;x+=40)
      if(nav.clear({x:x-100,y},{x:x+100,y})){start={x,y};break;}
    if(!start)throw new Error('Нет места для проверки воздушного снаряда');
    e.body.enable=true;e.body.reset(start.x,start.y);e.body.updateFromGameObject();
    e.behavior.restoreFlight({launch:{x:start.x+150,y:start.y},launchStart:{x:start.x-150,y:start.y},
      launchTravelled:150,launchLength:300,launchDepth:tree.y+1,wavePhase:0,pauseMs:0});
    e.updateBehavior(0);
    const hp=e.actorState.health,immune=e.takeDamage(1)===false&&e.actorState.health===hp;
    const {AcornProjectile}=await import('/src/entities/AcornProjectile.ts');
    const shoot=()=>{const body=e.body,shot=new AcornProjectile(s,s.player,body.x-40,body.center.y,{x:1,y:0});
      s.acorns.shots.push(shot);shot.body.reset(body.right+40,body.center.y);shot.body.updateFromGameObject();s.acorns.update(0);return shot;};
    const shot=shoot();
    const passed=!!shot.scene&&e.actorState.health===hp;
    const curved=e.airborne.visible&&!e.visible&&e.y-e.airborne.y>140&&!e.body.enable&&
      !e.treeCollider.active&&!e.playerCollider.active&&!!(e.airborne.cameraFilter&s.hudCamera.id);
    const playerPosition={x:s.player.x,y:s.player.y},pb=s.player.body;
    pb.enable=true;pb.reset(s.player.x+e.body.center.x-pb.center.x,s.player.y+e.body.bottom-pb.bottom);pb.updateFromGameObject();
    const overlapPosition={x:s.player.x,y:s.player.y},health=s.playerHealth;
    const noContact=!s.physics.world.collide(s.player,e)&&s.player.x===overlapPosition.x&&s.player.y===overlapPosition.y&&s.playerHealth===health;
    pb.reset(playerPosition.x,playerPosition.y);pb.updateFromGameObject();pb.enable=false;
    const snapshot=e.snapshot(),height=e.airborne.y;e.restore(snapshot);
    const restored=Math.abs(e.airborne.y-height)<.001&&!e.body.enable&&e.behavior.launching;
    const playerHP=s.playerHealth,playerBefore={x:s.player.x,y:s.player.y};
    const flyBefore={x:e.x,y:e.y};e.updateBehavior(200);
    const visualOnly=!e.body.enable&&Math.hypot(e.x-flyBefore.x,e.y-flyBefore.y)>10&&
      s.player.x===playerBefore.x&&s.player.y===playerBefore.y&&s.playerHealth===playerHP;
    const physical={x:e.body.x,y:e.body.y,w:e.body.width,h:e.body.height};
    s.acorns.shots.forEach(shot=>shot.destroy());s.acorns.shots.length=0;
    e.behavior.restoreFlight();e.updateBehavior(0);const hit=shoot();
    const landed=!hit.scene&&e.actorState.health===hp-1&&e.visible&&!e.airborne.visible&&e.body.enable&&
      e.body.x===physical.x&&e.body.y===physical.y&&e.body.width===physical.w&&e.body.height===physical.h;
    return {immune,passed,curved,restored,landed,visualOnly,noContact};
  });
  ok(result.immune&&result.passed,'Во время разлёта муха не теряет HP, настоящий жёлудь пролетает под ней и остаётся в полёте');
  ok(result.curved&&result.restored&&result.visualOnly&&result.noContact,'Вылет — только движущаяся анимация: тело и коллайдеры выключены, даже пересечение с друидом не наносит урон и не толкает; сейв сохраняет отсутствие физики');
  ok(result.landed,'После приземления тот же жёлудь попадает в ту же коллизию, снимает 1 HP; тело не смещается вслед за высотой');
}
