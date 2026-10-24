/** Population rules, source art, shared footprints and saved-run compatibility. */
export async function testFallenLogs(page,ok) {
  const stats=await page.evaluate(async()=>{
    const {generateMeadow,obstacleRect,obstacleVisualRect,overlaps}=await import('/src/world/meadowLayout.ts');
    const {logVisualRect,logCollisionRects,logPoint,mushroomPoint,onMushroomSurface}=await import('/src/world/fallenLogs.ts');
    const {FALLEN_LOGS,ACTIVE_LOG_VARIANTS,LOG_MUSHROOMS}=await import('/src/data/fallenLogs.ts');
    const counts=new Set(),amounts=new Set(),species=new Set(),variants=new Set(),angles=new Set();
    let total=0,covered=0,safe=true,repeatable=true,homogeneous=true,native=true,scattered=true;
    const points=new Set(),regions=new Set(),tiltBands=new Set();
    for(let seed=0;seed<1500;seed++) {
      const layout=generateMeadow(seed);counts.add(layout.logs.length);total+=layout.logs.length;
      safe&&=layout.counts.logs===layout.logs.length&&layout.logs.length>=1&&layout.logs.length<=2;
      const spawn={x:layout.spawn.x-80,y:layout.spawn.y-80,width:160,height:160};
      for(const log of layout.logs) {
        native&&=log.angle>=-15&&log.angle<=15&&log.flipX===false;variants.add(log.variant);angles.add(log.angle);const bounds=logVisualRect(log),body=logCollisionRects(log);
        regions.add(`${Math.min(2,Math.floor(log.x/layout.width*3))}:${Math.min(2,Math.floor(log.y/layout.height*3))}`);
        tiltBands.add(Math.min(5,Math.floor((log.angle+15)/5)));
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
    let surfaceCapacity=0;
    for(const variant of ACTIVE_LOG_VARIANTS) {
      const art=FALLEN_LOGS[variant];
      for(let y=1;y<art.height-1;y++)for(let x=1;x<art.width-1;x++)
        if(onMushroomSurface(variant,{x,y}))surfaceCapacity++;
    }
    const scene=window.__smokeGame.scene.getScene('Room');
    const generated=generateMeadow(scene.layout.seed);
    const rotationsKept=scene.layout.logs.every((log,index)=>log.angle===generated.logs[index].angle)&&
      scene.layout.logs.some(log=>Math.abs(log.angle)>1);
    let art=true,rendered=true,bodies=true,upright=true;
    for(const sprite of [...FALLEN_LOGS,...LOG_MUSHROOMS]) {
      const t=scene.textures.get(sprite.id),source=t.getSourceImage(),c=document.createElement('canvas');c.width=source.width;c.height=source.height;
      const ctx=c.getContext('2d');ctx.drawImage(source,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;
      art&&=t.source[0].scaleMode===1&&c.width===sprite.width&&c.height===sprite.height&&
        data.some((v,i)=>i%4===3&&v===0)&&data.every((v,i)=>i%4!==3||v===0||v===255);
    }
    for(const [index,log] of scene.layout.logs.entries()) {
      const image=scene.children.getByName(`fallen-log-${index}`),a=FALLEN_LOGS[log.variant];
      rendered&&=image.texture.key===a.id&&Math.abs(image.angle-log.angle)<1e-8&&image.flipX===log.flipX&&image.scaleX===a.scale;
      const expected=logCollisionRects(log),actual=scene.world.obstacles.getChildren().filter(o=>o.name.startsWith(`fallen-log-collider-${index}-`));
      bodies&&=actual.length===expected.length&&actual.every((o,n)=>!o.visible&&o.body.enable&&
        Math.abs(o.body.x-expected[n].x)<.001&&Math.abs(o.body.y-expected[n].y)<.001&&
        Math.abs(o.body.width-expected[n].width)<.001&&Math.abs(o.body.height-expected[n].height)<.001);
      for(const [n,m] of log.mushrooms.entries()) {
        const image=scene.children.getByName(`log-mushroom-${index}-${m.slot}`),p=mushroomPoint(log,m);
        upright&&=image.angle===0&&!image.body&&image.texture.key===LOG_MUSHROOMS[m.variant].id&&
          image.scaleX===LOG_MUSHROOMS[m.variant].scale&&image.scaleY===image.scaleX&&image.originY===1&&
          Math.abs(image.x-p.x)<.001&&Math.abs(image.y-p.y)<.001&&image.depth>scene.children.getByName(`fallen-log-${index}`).depth;
      }
    }
    const {WolfNavigation}=await import('/src/world/WolfNavigation.ts');
    const {mouseCanStand}=await import('/src/behavior/MouseWander.ts');
    const log={x:500,y:400,variant:4,angle:90,flipX:false,mushrooms:[]};
    const layout={width:1000,height:800,seed:0,spawn:{x:100,y:100},counts:{trees:0,logs:1},obstacles:[],logs:[log]};
    const nav=new WolfNavigation(layout),line=logCollisionRects(log),center=line[Math.floor(line.length/2)];
    const target={x:center.x+center.width/2,y:center.y+center.height};
    const route=nav.route({x:320,y:400},{x:680,y:400});
    const navigation=!nav.canStand(target)&&!mouseCanStand(layout,target)&&route.length>0&&route.every(p=>nav.canStand(p));
    const rect=logVisualRect(log);
    const corners=[{x:rect.x+1,y:rect.y+1},{x:rect.x+rect.width-1,y:rect.y+1},
      {x:rect.x+1,y:rect.y+rect.height-1},{x:rect.x+rect.width-1,y:rect.y+rect.height-1}];
    const emptyCorners=corners.some(p=>nav.canStand(p)&&mouseCanStand(layout,p));
    const noHint=!scene.hint&&!scene.children.list.some(o=>o.text?.includes('WASD —'))&&scene.hud.list.length===4;
    return{counts:[...counts].sort(),amounts:[...amounts].sort(),species:species.size,variants:[...variants],angleCount:angles.size,
      fraction:covered/total,scattered,regions:regions.size,tiltBands:tiltBands.size,pointCount:points.size,surfaceCapacity,native,safe,homogeneous,repeatable,art,rendered,rotationsKept,bodies,upright,navigation,emptyCorners,noHint};
  });
  ok(stats.counts.join()==='1,2'&&stats.safe&&stats.regions===1,'1500 локаций: 1–2 бревна в нижней правой комнате, без крон, пересечений и привязки к старту');
  ok(stats.amounts.join()==='0,1,2'&&stats.homogeneous,
    `На брёвнах 0–2 группы грибов, один вид на бревне (${(stats.fraction*100).toFixed(1)}%)`);
  ok(stats.species===2&&stats.variants.join()==='4'&&stats.angleCount>100&&stats.tiltBands===6&&stats.native&&stats.repeatable,'Только серое бревно и 2 вида грибов; случайный наклон −15…+15° без отражения, весь диапазон используется, seed воспроизводится');
  ok(stats.scattered&&stats.pointCount>=stats.surfaceCapacity*.9,'Грибы разбросаны по древесине в двух измерениях, с промежутками; позиции не ограничены тремя гнёздами');
  ok(await page.evaluate(async()=>{
    const {mushroomPoint}=await import('/src/world/fallenLogs.ts');
    const log={x:500,y:400,variant:4,angle:0,flipX:false,mushrooms:[]};
    const mushroom={variant:0,slot:0,surface:{x:29,y:18}};
    const a=mushroomPoint(log,mushroom),b=mushroomPoint({...log,angle:90},mushroom);
    return Math.abs(b.x-(500-(a.y-400)))<1e-9&&Math.abs(b.y-(400+a.x-500))<1e-9;
  }),'При повороте бревна крепления грибов поворачиваются с древесиной, сами грибы остаются вертикальными');
  ok(stats.art,'Вырезанные PNG прозрачны без полупрозрачной каймы; размеры и NEAREST сохранены');
  ok(await page.evaluate(async()=>{
    const {LOG_MUSHROOMS}=await import('/src/data/fallenLogs.ts');
    const game=window.__smokeGame;
    const read=image=>{const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
    let exact=true,guard=true,clean=true;
    for(const art of LOG_MUSHROOMS) {
      const original=new Image();original.src=`/docs/art/log-mushrooms-v3/${art.file}`;await original.decode();
      const expected=read(original),actual=read(game.textures.get(art.id).getSourceImage());
      exact&&=actual.every((v,i)=>v===expected[i]);
      let count=0;
      for(let y=0;y<art.height;y++)for(let x=0;x<art.width;x++) {
        const i=(y*art.width+x)*4;
        if(x===0||y===0||x===art.width-1||y===art.height-1)guard&&=actual[i+3]===0;
        if(actual[i+3]) {
          count++;
          const rgb=[actual[i],actual[i+1],actual[i+2]];
          clean&&=!(Math.min(...rgb)>=230&&Math.max(...rgb)-Math.min(...rgb)<=18);
        }
      }
      exact&&=count===art.retainedPixels;
    }
    const active=game.textures.getTextureKeys().filter(key=>/^mushroom-\d+$/.test(key));
    return exact&&guard&&clean&&active.length===2&&LOG_MUSHROOMS.length===2;
  }),'Только два новых грибных PNG: пиксели загружены 1:1, края прозрачны, нейтрального белого фона нет');
  ok(stats.rendered&&stats.rotationsKept&&stats.upright,'Комната сохраняет углы генератора и поворачивает рисунки брёвен; грибы остаются вертикальными');
  ok(await page.evaluate(async()=>{
    const {LOG_MUSHROOMS}=await import('/src/data/fallenLogs.ts');
    const original=(await import('/docs/art/log-mushrooms-v3/sprites.json')).default.mushrooms;
    return LOG_MUSHROOMS.length===2&&LOG_MUSHROOMS.every((sprite,index)=>
      Math.abs(sprite.scale-original[index].scale*(2/3)*2)<1e-12);
  }),'Оба вида грибов увеличены ровно вдвое, основание остаётся на древесине');
  ok(stats.bodies&&stats.navigation&&stats.emptyCorners,'Коллизии, обход волка и маршрут мыши учитывают древесину, пустые углы проходимы');
  ok(await page.evaluate(async()=>{
    const {FALLEN_LOGS}=await import('/src/data/fallenLogs.ts');
    const {logPoint,logCollisionRects}=await import('/src/world/fallenLogs.ts');
    return FALLEN_LOGS.every((art,variant)=>{
      const log={x:500,y:400,variant,angle:0,flipX:false,mushrooms:[]};
      return art.scale===2&&Math.abs(art.width*art.scale-art.previousWorldWidth*2/3)<=1&&
        [-179,-90,-35,0,35,90,179].every(angle=>{
          const rotated={...log,angle},p=logPoint(log,0,0),actual=logPoint(rotated,0,0),r=angle*Math.PI/180;
          const expected={x:500+(p.x-500)*Math.cos(r)-(p.y-400)*Math.sin(r),
            y:400+(p.x-500)*Math.sin(r)+(p.y-400)*Math.cos(r)};
          const plain=logCollisionRects(log),bodies=logCollisionRects(rotated);
          return Math.hypot(actual.x-expected.x,actual.y-expected.y)<1e-9&&bodies.every(b=>
            Math.abs(b.width-plain[0].width)<1e-9&&Math.abs(b.height-plain[0].height)<1e-9);
        });
    });
  }),'Геометрия поворачивает точки древесины и коллизии вокруг центра, сетка и размер сохраняются');
  ok(stats.noHint,'Нижняя серая подсказка управления удалена из игрового HUD');
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room');const {isRunSave,loadRun,RUN_SAVE_KEY}=await import('/src/persistence/runSave.ts');
    const snapshot={version:1,savedAt:Date.now(),characterId:s.characterId,layout:structuredClone(s.layout),
      player:s.player.snapshot(),camera:{x:s.cameras.main.midPoint.x,y:s.cameras.main.midPoint.y},world:s.world.snapshot(),shots:[]};
    const valid=isRunSave(snapshot),legacySlots=structuredClone(snapshot),legacy=structuredClone(snapshot);
    legacySlots.layout.logs.forEach(l=>l.mushrooms.forEach(m=>delete m.surface));
    delete legacy.layout.logs;delete legacy.layout.counts.logs;delete legacy.layout.rooms;delete legacy.world.cleansing;delete legacy.world.bear;
    const corrupt=mutate=>{const saved=structuredClone(snapshot);mutate(saved.layout.logs[0]);return !isRunSave(saved);};
    const oldSet=structuredClone(snapshot);
    // A real legacy run: four brown variants, some already collected slots.
    oldSet.layout.logs.forEach((log,i)=>{
      log.variant=i%4;
      log.mushrooms.forEach(m=>{m.variant=6;delete m.surface;});
    });
    const before=localStorage.getItem(RUN_SAVE_KEY);
    let migrated=false;
    try {
      localStorage.setItem(RUN_SAVE_KEY,JSON.stringify(oldSet));
      const restored=loadRun();
      const {onMushroomSurface}=await import('/src/world/fallenLogs.ts');
      migrated=!!restored&&isRunSave(restored)&&restored.layout.logs.every((log,i)=>
        log.variant===4&&
        log.x===snapshot.layout.logs[i].x&&log.y===snapshot.layout.logs[i].y&&
        log.mushrooms.length===snapshot.layout.logs[i].mushrooms.length&&
        log.mushrooms.every((m,n)=>m.variant===0&&m.slot===snapshot.layout.logs[i].mushrooms[n].slot&&
          onMushroomSurface(4,m.surface)))&&JSON.stringify(restored)===JSON.stringify(loadRun());
    } finally { if(before===null)localStorage.removeItem(RUN_SAVE_KEY);else localStorage.setItem(RUN_SAVE_KEY,before); }
    return migrated&&valid&&isRunSave(legacy)&&isRunSave(legacySlots)&&corrupt(l=>l.variant=100)&&corrupt(l=>l.mushrooms=[{slot:0,variant:7}])&&corrupt(l=>l.angle=null)&&corrupt(l=>l.flipX='yes')&&
      corrupt(l=>l.mushrooms=[{slot:0,variant:0},{slot:1,variant:1}])&&corrupt(l=>l.mushrooms=[{slot:9,variant:0}])&&
      corrupt(l=>l.mushrooms=[{slot:0,variant:0,surface:{x:0,y:0}}]);
  }),'Сейвы сохраняют позиции и сбор; коричневые брёвна заменяются серыми с новыми точками роста, старые грибы — новыми');
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),{saveRun,loadRun,clearRun}=await import('/src/persistence/runSave.ts');
    const snapshot={version:1,savedAt:Date.now(),characterId:s.characterId,layout:structuredClone(s.layout),
      player:s.player.snapshot(),camera:{...s.cameraFollow.center},world:s.world.snapshot(),shots:[]};
    snapshot.layout.logs.forEach((l,i)=>l.angle=i===0?-170:i===1?150:7);
    saveRun(snapshot);const migrated=loadRun();clearRun();
    return migrated.layout.logs.every((l,i)=>l.angle===(i===0?-15:i===1?15:7)&&
      l.x===snapshot.layout.logs[i].x&&l.y===snapshot.layout.logs[i].y&&
      JSON.stringify(l.mushrooms)===JSON.stringify(snapshot.layout.logs[i].mushrooms));
  }),'Старые сохранения ограничивают наклон до ±15°, сохраняя позиции брёвен и собранные грибы');
  ok(await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),{AcornProjectile}=await import('/src/entities/AcornProjectile.ts');
    const proxies=s.world.obstacles.getChildren().filter(o=>o.getData('kind')==='log');
    const body=proxies[Math.floor(proxies.length/2)].body;
    const shot=new AcornProjectile(s,s.player,body.x-20,body.center.y,{x:1,y:0});
    s.acorns.shots.push(shot);shot.body.reset(body.right+20,body.center.y);shot.body.updateFromGameObject();s.acorns.update(0);
    return !shot.scene;
  }),'Настоящий жёлудь исчезает при столкновении с бревном');
}
