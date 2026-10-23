/** Test irregular flight with the real routing, timing and save format. */
export async function testInsectFlight(page,ok) {
  const result=await page.evaluate(async()=>{
    const {generateMeadow}=await import('/src/world/meadowLayout.ts');
    const {WolfNavigation}=await import('/src/world/WolfNavigation.ts');
    const {InsectFlight}=await import('/src/behavior/InsectFlight.ts');
    const {FOREST_INSECT}=await import('/src/data/forestInsect.ts');
    const {cleansingEnemySpawns}=await import('/src/world/CleansingEncounter.ts');
    const layout=generateMeadow(0),room=layout.rooms[7],nav=new WolfNavigation(layout,FOREST_INSECT.body);
    const tree=room.tree,player={x:tree.x+65,y:tree.y},points=cleansingEnemySpawns(layout,room,nav,player);
    let launches=true;
    for(let i=0;i<3;i++) {
      const start={x:tree.x+(i-1)*36,y:tree.y-150},ai=new InsectFlight(nav,start,i+1);ai.launch(points[i],tree.y+1);
      let position={...start};
      const rect={x:player.x-10,y:player.y-18,width:20,height:18};
      for(let t=0;t<15000&&ai.launching;t+=20){const v=ai.step(20,position,player,rect);position={x:position.x+v.x*.02,y:position.y+v.y*.02};}
      launches&&=!ai.launching&&Math.hypot(position.x-points[i].x,position.y-points[i].y)<13;
    }
    // Empty arena isolates the flight shape from detours forced by tree trunks.
    const empty={...layout,obstacles:[],logs:[],rooms:undefined,stump:undefined};
    const flightNav=new WolfNavigation(empty,FOREST_INSECT.body),target={x:2600,y:950},rect={x:2590,y:932,width:20,height:18};
    const ai=new InsectFlight(flightNav,{x:1000,y:950},6);ai.alert();let p={x:1000,y:950};
    let pauses=0,moving=0,positive=false,negative=false,speeds=true,attack=false;const ys=[],pauseLengths=[];let pauseLength=0;
    for(let t=0;t<30000;t+=20){
      const v=ai.step(20,p,target,rect),speed=Math.hypot(v.x,v.y);
      if(ai.actorState.phase==='attack'){attack=true;break;}
      if(speed<.01){pauses++;pauseLength+=20;}else {moving++;if(pauseLength){pauseLengths.push(pauseLength);pauseLength=0;}positive||=v.y>10;negative||=v.y< -10;speeds&&=speed<=FOREST_INSECT.stats.runSpeed+.001;}
      p={x:p.x+v.x*.02,y:p.y+v.y*.02};ys.push(p.y);
    }
    const s=window.__smokeGame.scene.getScene('Room');s.world.cleansing.tree.completeInteraction();
    const e=s.world.cleansing.enemies[0],saved=e.snapshot();
    e.behavior.restoreFlight();e.restore(saved);
    const preserved=JSON.stringify(e.behavior.snapshotFlight())===JSON.stringify(saved.flight);
    const snapshot={version:1,savedAt:Date.now(),characterId:s.characterId,layout:s.layout,player:s.player.snapshot(),camera:{...s.cameraFollow.center},world:s.world.snapshot(),shots:s.acorns.snapshot()},{isRunSave}=await import('/src/persistence/runSave.ts');
    const valid=isRunSave(snapshot),bad=structuredClone(snapshot);bad.world.cleansing.enemies[0].flight.pauseMs=-1;
    return {launches,spread:points.every(p=>Math.hypot((p.x-tree.x)/480,(p.y-tree.y)/270)>=.69),
      positive,negative,pauses,moving,speeds,attack,pauseLengths,preserved,valid,rejectBad:!isRunSave(bad)};
  });
  ok(result.launches&&result.spread,'Все три мухи вылетают из кроны к разным точкам овала 960×540, затем завершают разлёт');
  ok(result.positive&&result.negative&&result.moving>100&&result.speeds&&result.attack,
    'Погоня отклоняется в обе стороны, сохраняет скорость 0,8 и доводит врага до настоящей атаки');
  ok(result.pauses>0&&result.pauseLengths.every(t=>t>=200&&t<=380),'Редкие зависания длятся около 0,3 секунды и не останавливают преследование навсегда');
  ok(result.preserved&&result.valid&&result.rejectBad,'Полёт из кроны и состояние зигзагов входят в сохранение; повреждённые таймеры отвергаются');
}
