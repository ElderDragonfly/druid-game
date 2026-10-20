/** Population rules, source art, shared footprints and saved-run compatibility. */
export async function testFallenLogs(page,ok) {
  const stats=await page.evaluate(async()=>{
    const {generateMeadow,obstacleRect,obstacleVisualRect,overlaps}=await import('/src/world/meadowLayout.ts');
    const {logVisualRect,logCollisionRects,logPoint,mushroomPoint,onMushroomSurface}=await import('/src/world/fallenLogs.ts');
    const {FALLEN_LOGS,LOG_MUSHROOMS}=await import('/src/data/fallenLogs.ts');
    const counts=new Set(),amounts=new Set(),species=new Set(),variants=new Set(),angles=new Set();
    let total=0,covered=0,safe=true,repeatable=true,homogeneous=true,native=true,scattered=true,visible=true;
    const points=new Set();
    for(let seed=0;seed<1500;seed++) {
      const layout=generateMeadow(seed);counts.add(layout.logs.length);total+=layout.logs.length;
      safe&&=layout.counts.logs===layout.logs.length&&layout.logs.length===4&&layout.logs[0].mushrooms.length>0;
      const spawn={x:layout.spawn.x-80,y:layout.spawn.y-80,width:160,height:160};
      for(const log of layout.logs) {
        native&&=log.angle===0&&log.flipX===false;variants.add(log.variant);angles.add(log.angle);const bounds=logVisualRect(log),body=logCollisionRects(log);
        visible&&=Math.abs(log.x-layout.spawn.x)<=240&&Math.abs(log.y-layout.spawn.y)<=155;
        for(const m of log.mushrooms) {
          scattered&&=onMushroomSurface(log.variant,m.surface)&&log.mushrooms.every(other=>other===m||Math.hypot(other.surface.x-m.surface.x,other.surface.y-m.surface.y)>=6);
          points.add(`${log.variant}:${m.surface.x}:${m.surface.y}`);
        }
        safe&&=bounds.x>=24&&bounds.y>=24&&bounds.x+bounds.width<=layout.width-24&&bounds.y+bounds.height<=layout.height-24&&
          !overlaps(bounds,spawn)&&!layout.obstacles.some(tree=>overlaps(bounds,obstacleVisualRect(tree),23))&&!layout.obstacles.some(tree=>body.some(r=>overlaps(r,obstacleRect(tree),27)));
        homogeneous&&=new Set(log.mushrooms.map(m=>m.variant)).size<=1&&new Set(log.mushrooms.map(m=>m.slot)).size===log.mushrooms.length;
        if(log.mushrooms.length)covered++;
        amounts.add(log.mushrooms.length);log.mushrooms.forEach(m=>species.add(m.variant));
      }
      if(seed<10)repeatable&&=JSON.stringify(layout)===JSON.stringify(generateMeadow(seed));
    }
    const scene=window.__smokeGame.scene.getScene('Room');
    let art=true,rendered=true,bodies=true,upright=true;
    for(const sprite of [...FALLEN_LOGS,...LOG_MUSHROOMS]) {
      const t=scene.textures.get(sprite.id),source=t.getSourceImage(),c=document.createElement('canvas');c.width=source.width;c.height=source.height;
      const ctx=c.getContext('2d');ctx.drawImage(source,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;
      art&&=t.source[0].scaleMode===1&&c.width===sprite.width&&c.height===sprite.height&&
        data.some((v,i)=>i%4===3&&v===0)&&data.every((v,i)=>i%4!==3||v===0||v===255);
    }
    for(const [index,log] of scene.layout.logs.entries()) {
      const image=scene.children.getByName(`fallen-log-${index}`),a=FALLEN_LOGS[log.variant];
      rendered&&=image.texture.key===a.id&&image.angle===log.angle&&image.flipX===log.flipX&&image.scaleX===a.scale;
      const expected=logCollisionRects(log),actual=scene.world.obstacles.getChildren().filter(o=>o.name.startsWith(`fallen-log-collider-${index}-`));
      bodies&&=actual.length===expected.length&&actual.every((o,n)=>!o.visible&&o.body.enable&&
        Math.abs(o.body.x-expected[n].x)<.001&&Math.abs(o.body.y-expected[n].y)<.001&&
        Math.abs(o.body.width-expected[n].width)<.001&&Math.abs(o.body.height-expected[n].height)<.001);
      for(const [n,m] of log.mushrooms.entries()) {
        const image=scene.children.getByName(`log-mushroom-${index}-${m.slot}`),p=mushroomPoint(log,m);
        upright&&=image.angle===0&&!image.body&&image.texture.key===LOG_MUSHROOMS[m.variant].id&&
          Math.abs(image.x-p.x)<.001&&Math.abs(image.y-p.y)<.001&&image.depth>scene.children.getByName(`fallen-log-${index}`).depth;
      }
    }
    const {WolfNavigation}=await import('/src/world/WolfNavigation.ts');
    const {mouseCanStand}=await import('/src/behavior/MouseWander.ts');
    const log={x:500,y:400,variant:0,angle:0,flipX:false,mushrooms:[]};
    const layout={width:1000,height:800,seed:0,spawn:{x:100,y:100},counts:{trees:0,logs:1},obstacles:[],logs:[log]};
    const nav=new WolfNavigation(layout),line=logCollisionRects(log),center=line[Math.floor(line.length/2)];
    const target={x:center.x+center.width/2,y:center.y+center.height};
    const route=nav.route({x:320,y:400},{x:680,y:400});
    const navigation=!nav.canStand(target)&&!mouseCanStand(layout,target)&&route.length>0&&route.every(p=>nav.canStand(p));
    const rect=logVisualRect(log);
    const corners=[{x:rect.x+30,y:rect.y+20},{x:rect.x+rect.width-30,y:rect.y+20},
      {x:rect.x+30,y:rect.y+rect.height-5},{x:rect.x+rect.width-30,y:rect.y+rect.height-5}];
    const emptyCorners=corners.some(p=>nav.canStand(p)&&mouseCanStand(layout,p));
    const noHint=!scene.hint&&!scene.children.list.some(o=>o.text?.includes('WASD —'))&&scene.hud.list.length===4;
    return{counts:[...counts].sort(),amounts:[...amounts].sort(),species:species.size,variants:variants.size,angleCount:angles.size,
      fraction:covered/total,scattered,visible,pointCount:points.size,native,safe,homogeneous,repeatable,art,rendered,bodies,upright,navigation,emptyCorners,noHint};
  });
  ok(stats.counts.join()==='4'&&stats.safe&&stats.visible,'1500 тестовых локаций: четыре видимых бревна около старта, без крон и с безопасным проходом');
  ok(Math.abs(stats.fraction-.625)<.025&&stats.amounts.join()==='0,1,2,3'&&stats.homogeneous,
    `Тест: на первом бревне гарантированы 1–3 гриба, у остальных шанс 50%; один вид на бревно (${(stats.fraction*100).toFixed(1)}%)`);
  ok(stats.species===7&&stats.variants===5&&stats.angleCount===1&&stats.native&&stats.repeatable,'Все 5 брёвен и 7 видов грибов доступны; только исходный ракурс без отражения, seed воспроизводится');
  ok(stats.scattered&&stats.pointCount>200,'Грибы разбросаны по древесине в двух измерениях, с промежутками; позиции не ограничены тремя гнёздами');
  ok(stats.art,'Вырезанные PNG прозрачны без полупрозрачной каймы; размеры и NEAREST сохранены');
  ok(await page.evaluate(async()=>{
    const read=async path=>{const i=new Image();i.src=path;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const ctx=c.getContext('2d');ctx.drawImage(i,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
    let preserved=true,cleaned=0;
    for(let n=0;n<7;n++) {
      const original=await read(`/docs/art/fallen-logs-v1/mushroom-${n}.png`);
      const source=window.__smokeGame.textures.get(`mushroom-${n}`).getSourceImage();
      const c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.drawImage(source,0,0);const actual=ctx.getImageData(0,0,c.width,c.height).data;
      let removed=0,total=0;
      for(let i=0;i<original.length;i+=4) {
        if(original[i+3]===255)total++;
        if(actual[i+3]) {preserved&&=original[i+3]===255;for(let k=0;k<3;k++)preserved&&=actual[i+k]===original[i+k];}
        else if(original[i+3]===255) {
          removed++;const y=Math.floor(i/4/c.width);
          preserved&&=(n===2&&y<32)||(n===4&&y<40);
        }
      }
      if(removed)cleaned++;
      preserved&&=removed<total*.25;
    }
    return preserved&&cleaned===2;
  }),'Кайма удалена только у двух фиолетовых шляпок; RGB оставшихся пикселей, белые ножки и другие грибы сохранены');
  ok(stats.rendered&&stats.upright,'В игре стоят выбранные варианты; грибы растут на уменьшенном бревне вертикально');
  ok(stats.bodies&&stats.navigation&&stats.emptyCorners,'Коллизии, обход волка и маршрут мыши учитывают древесину, пустые углы проходимы');
  ok(await page.evaluate(async()=>{
    const {FALLEN_LOGS}=await import('/src/data/fallenLogs.ts');
    const {logPoint,logCollisionRects}=await import('/src/world/fallenLogs.ts');
    return FALLEN_LOGS.every((art,variant)=>{
      const log={x:500,y:400,variant,angle:0,flipX:false,mushrooms:[]};
      const legacy={...log,angle:35,flipX:true};
      return art.scale===2&&Math.abs(art.width*art.scale-art.previousWorldWidth*2/3)<=1&&
        JSON.stringify(logPoint(log,0,0))===JSON.stringify(logPoint(legacy,0,0))&&
        JSON.stringify(logCollisionRects(log))===JSON.stringify(logCollisionRects(legacy));
    });
  }),'Брёвна уменьшены на треть на сетке 2 ед./пиксель; старые повороты не меняют новую геометрию');
  ok(stats.noHint,'Нижняя серая подсказка управления удалена из игрового HUD');
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room');const {isRunSave}=await import('/src/persistence/runSave.ts');
    const snapshot={version:1,savedAt:Date.now(),characterId:s.characterId,layout:structuredClone(s.layout),
      player:s.player.snapshot(),camera:{x:s.cameras.main.midPoint.x,y:s.cameras.main.midPoint.y},world:s.world.snapshot(),shots:[]};
    const valid=isRunSave(snapshot),legacySlots=structuredClone(snapshot),legacy=structuredClone(snapshot);
    legacySlots.layout.logs.forEach(l=>l.mushrooms.forEach(m=>delete m.surface));
    delete legacy.layout.logs;delete legacy.layout.counts.logs;
    const corrupt=mutate=>{const saved=structuredClone(snapshot);mutate(saved.layout.logs[0]);return !isRunSave(saved);};
    return valid&&isRunSave(legacy)&&isRunSave(legacySlots)&&corrupt(l=>l.variant=100)&&corrupt(l=>l.angle=null)&&corrupt(l=>l.flipX='yes')&&
      corrupt(l=>l.mushrooms=[{slot:0,variant:0},{slot:1,variant:1}])&&corrupt(l=>l.mushrooms=[{slot:9,variant:0}])&&
      corrupt(l=>l.mushrooms=[{slot:0,variant:0,surface:{x:0,y:0}}]);
  }),'Новый сейв хранит брёвна/грибы; старый сейв поддерживается, повреждённые данные отклоняются');
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),{AcornProjectile}=await import('/src/entities/AcornProjectile.ts');
    const proxies=s.world.obstacles.getChildren().filter(o=>o.getData('kind')==='log');
    const body=proxies[Math.floor(proxies.length/2)].body;
    const shot=new AcornProjectile(s,s.player,body.x-20,body.center.y,{x:1,y:0});
    s.acorns.shots.push(shot);shot.body.reset(body.right+20,body.center.y);shot.body.updateFromGameObject();s.acorns.update(0);
    return !shot.scene;
  }),'Настоящий жёлудь исчезает при столкновении с бревном');
}
