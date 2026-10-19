/** Drag the actual UI through both endpoints and different camera zooms. */
export async function testMusicVolume(page, ok, click, wait) {
  const geometry = () => page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScenes(true)[0],o=s.children.getByName('music-volume'),c=s.cameras.getCamera('menu-ui');
    return{x:(o.x-c.worldView.x)*c.zoom,y:(o.y-c.worldView.y)*c.zoom,
      scale:o.scaleX*c.zoom,current:o.getData('volume'),half:o.width/2-18};
  });
  const drag = async fraction => {
    const p=await geometry();
    await page.mouse.move(Math.round(p.x+((p.current*2-1)*p.half)*p.scale),Math.round(p.y+6*p.scale));
    await page.mouse.down();
    await page.mouse.move(Math.round(p.x+((fraction*2-1)*p.half)*p.scale),Math.round(p.y+6*p.scale),{steps:8});
    await page.mouse.up();
  };
  const level = () => page.evaluate(()=>{
    const g=window.__smokeGame,s=g.scene.getScenes(true)[0],o=s.children.getByName('music-volume');
    return{volume:g.sound.get('forest-camp-music').volume,ui:o.getData('volume'),
      label:o.getByName('music-volume-label').text,stored:localStorage.getItem('druid-game.music-volume.v1')};
  });
  const inspect = async expected => {
    // Web Audio applies a new AudioParam value on its next rendering quantum.
    await page.waitForFunction(expected=>{
      const g=window.__smokeGame,o=g.scene.getScenes(true)[0].children.getByName('music-volume');
      return Math.abs(g.sound.get('forest-camp-music').volume-expected)<.001&&o.getData('volume')===expected;
    },expected,{timeout:1500}).catch(()=>{});
    const v=await level();const matches=Math.abs(v.volume-expected)<.001&&v.ui===expected&&
      v.label===`${Math.round(expected*100)}%`&&Number(v.stored)===expected;
    if(!matches)console.log('Volume mismatch',JSON.stringify({expected,...v}));
    return matches;
  };
  const noOverlays = key => page.evaluate(key=>{
    const s=window.__smokeGame.scene.getScene(key);
    return !s.children.getByName('music-toggle')&&!s.children.getByName('music-volume')&&
      window.__menuTrack.isPlaying&&window.__musicPlays===0;
  },key);
  await page.keyboard.press('Escape');await wait('MainMenu');
  ok(await noOverlays('MainMenu'),'Главное меню без динамика и ползунка в углу; музыка продолжается');
  await click('MainMenu','settings');await wait('Settings');
  await drag(.27);
  ok(await inspect(.27),'Перетаскивание устанавливает 27% в реальном аудио, подписи и сохранённой настройке');
  await drag(-.15);
  ok(await inspect(0),'Перетаскивание левее полоски даёт ровно 0%, без отрицательной громкости');
  await drag(1.15);
  ok(await inspect(1),'Перетаскивание правее полоски даёт ровно 100%, без превышения');
  const start=await geometry();
  const speaker=await page.evaluate(()=>{
    const s=window.__smokeGame.scene.getScene('Settings'),o=s.children.getByName('music-toggle'),c=s.cameras.getCamera('menu-ui');
    return{x:(o.x-c.worldView.x)*c.zoom,y:(o.y-c.worldView.y)*c.zoom};
  });
  await page.mouse.move(Math.round(start.x+start.half*start.scale),Math.round(start.y+6*start.scale));
  await page.mouse.down();await page.mouse.move(speaker.x,speaker.y,{steps:8});await page.mouse.up();
  ok(await page.evaluate(()=>window.__menuTrack.isPlaying),
    'Отпускание перетаскиваемого ползунка над динамиком не выключает музыку');
  const p=await geometry();
  await page.mouse.move(Math.round(p.x),Math.round(p.y+6*p.scale));await page.mouse.down();await page.mouse.up();
  ok(await inspect(.5),'Щелчок по середине полоски сразу устанавливает 50%');
  await page.mouse.move(p.x-70,p.y+6);
  ok(await inspect(.5),'После отпускания мыши громкость больше не следует за курсором');
  await page.setViewportSize({width:720,height:900});await page.waitForTimeout(80);
  await drag(.63);
  ok(await inspect(.63),'В высоком окне ползунок также точно устанавливает 63%');
  await page.keyboard.press('Escape');await wait('MainMenu');
  ok(await noOverlays('MainMenu'),'Возврат из настроек не добавляет звуковые элементы в главное меню');
  await page.keyboard.press('Enter');await wait('CharacterSelect');
  ok(await noOverlays('CharacterSelect'),'Выбор персонажа без звуковых элементов; трек не перезапускается');
  await page.keyboard.press('Escape');await wait('MainMenu');
  await click('MainMenu','settings');await wait('Settings');
  ok(await inspect(.63),'Повторное открытие настроек сохраняет 63%');
  await drag(.37);
  ok(await inspect(.37)&&await page.evaluate(()=>window.__menuTrack.isPlaying&&window.__musicPlays===0),
    'В настройках выбраны 37%; переходы и регулировка не перезапускают трек');
}
