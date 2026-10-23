import { testMusicVolume } from './music-volume-smoke.mjs';
/** Real audio graph, persistent preference and a whole saved/continued run. */
export async function testMenuSession(page, ok) {
  const wait = key => page.waitForFunction(key => {
    const g=window.__smokeGame;
    return g?.scene.getScenes(true).length===1&&g.scene.isActive(key)&&
      (key!=='Room'||g.scene.getScene(key).world&&g.scene.getScene(key).acorns);
  },key);
  const click = async (key,name) => {
    const p=await page.evaluate(({key,name})=>{
      const s=window.__smokeGame.scene.getScene(key),o=s.children.getByName(name),c=s.cameras.getCamera('menu-ui');
      return{x:(o.x-c.worldView.x)*c.zoom,y:(o.y-c.worldView.y)*c.zoom};
    },{key,name});await page.mouse.click(p.x,p.y);
  };
  const reload = async () => {
    await page.reload();await page.evaluate(async()=>{window.__smokeGame=(await import('/src/main.ts')).game;});await wait('MainMenu');
  };
  await page.keyboard.press('Escape');await wait('MainMenu');
  // Legacy scenarios deliberately blur Phaser; returning to this visible menu
  // must simulate the matching focus event before measuring its audio graph.
  await page.evaluate(()=>window.__smokeGame.events.emit('focus'));
  await page.mouse.click(20,100); // Normal user gesture unlocks browser audio.
  await page.waitForFunction(()=>window.__smokeGame.sound.get('forest-camp-music')?.isPlaying);
  ok(await page.evaluate(()=>{
    const g=window.__smokeGame,m=g.sound.get('forest-camp-music');
    window.__menuTrack=m;window.__musicPlays=0;m.on('play',()=>window.__musicPlays++);
    const a=g.sound.context.createAnalyser();a.fftSize=2048;g.sound.masterVolumeNode.connect(a);window.__audioProbe=a;
    return m.loop&&Math.abs(m.duration-45)<.01&&g.sound.getAll('forest-camp-music').length===1;
  }),'Музыка декодирована: один зацикленный 45-секундный трек');
  await page.waitForFunction(()=>{
    const data=new Float32Array(2048);window.__audioProbe.getFloatTimeDomainData(data);
    return data.some(v=>Math.abs(v)>.0001);
  });
  await click('MainMenu','play');await wait('CharacterSelect');
  ok(await page.evaluate(()=>window.__smokeGame.sound.get('forest-camp-music')===window.__menuTrack&&
    window.__menuTrack.isPlaying&&window.__musicPlays===0),
  'В аудиографе есть сигнал; переход в выбор персонажа продолжает тот же трек без перезапуска');
  await testMusicVolume(page,ok,click,wait);
  for(const viewport of [{width:1280,height:720},{width:720,height:900},{width:1920,height:540}]) {
    await page.setViewportSize(viewport);await page.waitForTimeout(80);
    ok(await page.evaluate(()=>{
      const s=window.__smokeGame.scene.getScene('Settings'),b=s.children.getByName('music-toggle'),c=s.cameras.getCamera('menu-ui');
      const volume=s.children.getByName('music-volume');
      return [b,volume].every(o=>{
        const r=o.getBounds(),left=(r.left-c.worldView.x)*c.zoom,top=(r.top-c.worldView.y)*c.zoom;
        return left>=0&&top>=0&&left+r.width*c.zoom<=s.scale.width&&top+r.height*c.zoom<=s.scale.height&&
          !!(o.cameraFilter&s.cameras.main.id)&&!(o.cameraFilter&c.id);
      })&&b.x===620&&b.y===285&&volume.x===480&&volume.y===360;
    }),`Динамик и ползунок внутри панели настроек и видны один раз при ${viewport.width}×${viewport.height}`);
  }
  await page.setViewportSize({width:1100,height:820});await page.waitForTimeout(80);
  await click('Settings','music-toggle');
  ok(await page.evaluate(()=>window.__menuTrack.isPaused&&localStorage.getItem('druid-game.music-enabled.v1')==='false'),
    'Динамик приостанавливает музыку и сохраняет выключенное состояние');
  await reload();await click('MainMenu','settings');await wait('Settings');
  ok(await page.evaluate(()=>!window.__smokeGame.sound.get('forest-camp-music').isPlaying&&
    window.__smokeGame.scene.getScene('Settings').children.getByName('music-toggle').getData('musicEnabled')===false),
  'Выключенная музыка остаётся выключенной после перезагрузки и открытия настроек');
  await page.waitForFunction(()=>Math.abs(window.__smokeGame.sound.get('forest-camp-music').volume-.37)<.001);
  ok(await page.evaluate(()=>Math.abs(window.__smokeGame.sound.get('forest-camp-music').volume-.37)<.001&&
    window.__smokeGame.scene.getScene('Settings').children.getByName('music-volume').getByName('music-volume-label').text==='37%'),
  'После перезагрузки и выключения музыки выбранные 37% сохранены');
  await click('Settings','music-toggle');
  await page.waitForFunction(()=>window.__smokeGame.sound.get('forest-camp-music').isPlaying);
  await page.evaluate(()=>window.__smokeGame.scene.getScene('Settings').scene.start('Room',{seed:0}));await wait('Room');
  ok(await page.evaluate(()=>window.__smokeGame.sound.get('forest-camp-music').isPaused),'При входе в игру музыка меню приостанавливается');
  await page.evaluate(async()=>{
    const s=window.__smokeGame.scene.getScene('Room'),p=s.player;s.physics.pause();
    s.world.wolves[0].takeDamage(2);s.world.update(2000);
    s.world.wolves[0].takeDamage(1);s.world.wolves[1].takeDamage(2);
    p.actorState.health=2;p.actorState.speed*=.8;p.actorState.attackRate=1.25;p.actorState.range=1.4;
    p.casting.update(0,'right');p.casting.update(180);p.updateCasting(0);
    const {AcornProjectile}=await import('/src/entities/AcornProjectile.ts');
    const a=new AcornProjectile(s,p,p.x+32,p.body.center.y,{x:1,y:0});
    a.flight.distance=60;a.ageMs=210;a.nextLeafDistance=12;a.updateVisual(0);s.acorns.shots.push(a);
  });
  await page.keyboard.press('Escape');await wait('MainMenu');
  const saved=await page.evaluate(async()=>{
    const {loadRun}=await import('/src/persistence/runSave.ts');return loadRun();
  });
  ok(saved?.player.state.health===2&&saved.player.state.range===1.4&&saved.player.cast.active&&
    saved.world.wolves.length===3&&saved.world.wolves.filter(w=>w.corpse).length===1&&saved.shots.length===1,
    'Escape сохраняет живого друида, изменённые характеристики, незавершённый каст, летящий жёлудь, волков и труп');
  ok(await page.evaluate(async saved=>{
    const {isRunSave}=await import('/src/persistence/runSave.ts');
    const invalid=mutate=>{const v=structuredClone(saved);mutate(v);return !isRunSave(v);};
    return isRunSave(saved)&&invalid(v=>v.player.state.health=0)&&invalid(v=>v.player.state.speed=null)&&
      invalid(v=>v.layout.obstacles[0].variant=9999)&&invalid(v=>v.shots[0].direction={x:0,y:0})&&
      invalid(v=>v.world.wolves[0].timers=null);
  },saved),'Слот проверяет HP, характеристики, варианты деревьев, направление снарядов и данные волков перед загрузкой');
  ok(await page.evaluate(()=>!!window.__smokeGame.scene.getScene('MainMenu').children.getByName('continue-run')&&
    window.__smokeGame.sound.get('forest-camp-music').isPlaying&&!window.__smokeGame.scene.isActive('Room')),
  'Появляется «Продолжить», музыка возвращается, игровая сцена остановлена');
  await reload();
  ok(await page.evaluate(()=>!!window.__smokeGame.scene.getScene('MainMenu').children.getByName('continue-run')),
    'Кнопка «Продолжить» сохраняется после полной перезагрузки страницы');
  await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Room');s.events.once('create',()=>s.physics.pause());
  });
  await click('MainMenu','continue-run');await wait('Room');
  const resumed=await page.evaluate(saved=>{
    const s=window.__smokeGame.scene.getScene('Room'),p=s.player,a=s.acorns.shots[0];
    return {
      layout:JSON.stringify(s.layout)===JSON.stringify(saved.layout),
      position:p.x===saved.player.x&&p.y===saved.player.y,
      stats:JSON.stringify(p.actorState)===JSON.stringify(saved.player.state)&&s.healthLabel.text==='HP 2/3',
      counts:s.world.wolves.length===2&&s.world.corpses.length===1,
      corpse:s.world.corpses[0]?.visible&&!s.world.corpses[0]?.body.enable,
      wolves:saved.world.wolves.filter(w=>!w.corpse).every((w,i)=>s.world.wolves[i].x===w.x&&s.world.wolves[i].y===w.y&&
        s.world.wolves[i].actorState.health===w.state.health&&s.world.wolves[i].actorState.alerted===w.state.alerted),
      mice:saved.world.mice.every((m,i)=>s.world.mice[i].x===m.x&&s.world.mice[i].y===m.y),
      camera:Math.abs(s.cameraFollow.center.x-saved.camera.x)<.01&&Math.abs(s.cameraFollow.center.y-saved.camera.y)<.01,
      projectile:!!a&&Math.abs(a.body.center.x-saved.shots[0].x)<.01&&a.flight.distance===60&&Math.abs(a.flight.maxDistance-384*1.4)<.01,
      casting:p.casting.active,
      music:!window.__smokeGame.sound.get('forest-camp-music').isPlaying,
    };
  },saved);
  const wolfDiffs=resumed.wolves ? [] : await page.evaluate(saved=>saved.world.wolves.filter(w=>!w.corpse).map((w,i)=>{
    const a=window.__smokeGame.scene.getScene('Room').world.wolves[i];
    return {i,expected:[w.x,w.y,w.state.health,w.state.alerted],actual:[a.x,a.y,a.actorState.health,a.actorState.alerted]};
  }).filter(d=>JSON.stringify(d.expected)!==JSON.stringify(d.actual)),saved);
  ok(Object.values(resumed).every(Boolean),`После reload/«Продолжить» восстановлены точная поляна, позиция/HP/статы, камера, живые/погибающие волки, труп, мыши, каст и жёлудь: ${JSON.stringify(resumed)} ${JSON.stringify(wolfDiffs)}`);
  await page.waitForFunction(()=>window.__smokeGame.scene.getScene('Room').acorns.emittedCount===1);
  await page.waitForFunction(()=>!window.__smokeGame.scene.getScene('Room').player.casting.active);
  ok(await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').acorns.emittedCount===1),
    'Прерванный меню каст завершает таймер и выпускает жёлудь ровно один раз');
  await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').physics.resume());
  await page.waitForFunction(()=>!window.__smokeGame.scene.getScene('Room').player.casting.active);
  const x=await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').player.x);
  await page.keyboard.down('d');await page.waitForTimeout(180);await page.keyboard.up('d');
  ok(await page.evaluate(x=>window.__smokeGame.scene.getScene('Room').player.x>x+5,x),'После продолжения работают WASD и физика');
  await page.evaluate(()=>{const p=window.__smokeGame.scene.getScene('Room').player;p.cancelHit();p.takeDamage(3);});
  await page.keyboard.press('Escape');await wait('CharacterSelect');await click('CharacterSelect','back');await wait('MainMenu');
  ok(await page.evaluate(()=>!localStorage.getItem('druid-game.run.v1')&&
    !window.__smokeGame.scene.getScene('MainMenu').children.getByName('continue-run')),'Смерть удаляет сохранение; погибший забег нельзя продолжить');
  await page.evaluate(()=>localStorage.setItem('druid-game.run.v1','{broken-json'));
  await reload();
  ok(await page.evaluate(async()=>{
    const {isRunSave}=await import('/src/persistence/runSave.ts');
    return !window.__smokeGame.scene.getScene('MainMenu').children.getByName('continue-run')&&
      !isRunSave({version:99})&&!isRunSave({version:1});
  }),'Повреждённое или несовместимое сохранение не ломает меню и не показывает «Продолжить»');
  await click('MainMenu','play');await wait('CharacterSelect');await click('CharacterSelect','start-run');await wait('Room');
  ok(await page.evaluate(()=>!localStorage.getItem('druid-game.run.v1')&&window.__smokeGame.scene.getScene('Room').playerHealth===3),
    'Новый забег начинается с 3 HP и очищает старый слот');
  await page.evaluate(()=>{
    window.__originalStorageSet=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(key==='druid-game.run.v1')throw new DOMException('Full storage','QuotaExceededError');
      return window.__originalStorageSet.call(this,key,value);
    };
  });
  await page.keyboard.press('Escape');await wait('MainMenu');
  ok(await page.evaluate(()=>!!window.__smokeGame.scene.getScene('MainMenu').children.getByName('continue-run')&&
    window.__smokeGame.scene.getScene('MainMenu').children.list.some(o=>o.text?.includes('до закрытия вкладки'))),
  'Если браузер запрещает запись, остаётся временное «Продолжить» с понятным сообщением');
  await page.evaluate(()=>{Storage.prototype.setItem=window.__originalStorageSet;delete window.__originalStorageSet;});
  await click('MainMenu','continue-run');await wait('Room');
  ok(await page.evaluate(()=>window.__smokeGame.scene.getScene('Room').playerHealth===3),
    'Временное сохранение продолжает игру и при недоступном постоянном хранилище');
  await page.keyboard.press('Escape');await wait('MainMenu');
  await page.evaluate(async()=>{
    const {clearRun}=await import('/src/persistence/runSave.ts');clearRun();window.__smokeGame.scene.getScene('MainMenu').scene.restart();
  });await wait('MainMenu');
}
