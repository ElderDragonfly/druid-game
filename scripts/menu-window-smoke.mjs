/** Menus fill the same browser window as gameplay, without cropping controls. */
export async function testMenuWindow(page,ok,clickNamed,waitScene) {
  const original=page.viewportSize();
  await clickNamed('CharacterSelect','back');await waitScene('MainMenu');
  const check=async(key,width,height)=>{
    await page.waitForFunction(({key,width,height})=>{
      const s=window.__smokeGame.scene.getScene(key);
      return s.sys.isActive()&&s.scale.width===width&&s.cameras.main.width===width&&
        s.cameras.getCamera('menu-ui')?.height===height;
    },{key,width,height});
    const result=await page.evaluate(key=>{
      const s=window.__smokeGame.scene.getScene(key),bg=s.children.getByName('camp-background');
      const c=s.cameras.main,ui=s.cameras.getCamera('menu-ui');
      const bounds=bg.getBounds();
      const project=(x,y,camera)=>({x:(x-camera.worldView.x)*camera.zoom,y:(y-camera.worldView.y)*camera.zoom});
      const tl=project(bounds.left,bounds.top,c),br=project(bounds.right,bounds.bottom,c);
      const buttons=s.children.list.filter(o=>o.name==='play'||o.name==='exit'||o.name==='back'||o.name==='continue-run'||o.name==='music-toggle'||
        o.name==='start-run'||o.name.startsWith('character-'));
      const controls=buttons.every(button=>{
        const r=button.getBounds(),a=project(r.left,r.top,ui),b=project(r.right,r.bottom,ui);
        return a.x>=-1&&a.y>=-1&&b.x<=s.scale.width+1&&b.y<=s.scale.height+1&&
          !!(button.cameraFilter&c.id)&&!(button.cameraFilter&ui.id);
      });
      const canvas=s.game.canvas.getBoundingClientRect();
      return{covered:tl.x<=1&&tl.y<=1&&br.x>=s.scale.width-1&&br.y>=s.scale.height-1,
        controls,layer:!(bg.cameraFilter&c.id)&&!!(bg.cameraFilter&ui.id),
        cameras:s.cameras.cameras.length,canvas:canvas.width===innerWidth&&canvas.height===innerHeight};
    },key);
    ok(result.covered&&result.canvas&&result.layer&&result.controls&&result.cameras===2,
      `${key} ${width}×${height}: фон закрывает всё окно, кнопки видимы полностью и не дублируются`);
  };
  for(const viewport of [{width:1280,height:720},{width:1920,height:540},{width:1100,height:820},{width:720,height:900}]){
    await page.setViewportSize(viewport);
    await check('MainMenu',viewport.width,viewport.height);
    if(viewport.width===1280)await page.screenshot({path:'test-results/main-menu-full-window.png'});
    await clickNamed('MainMenu','play');await waitScene('CharacterSelect');
    await check('CharacterSelect',viewport.width,viewport.height);
    await clickNamed('CharacterSelect','character-druid');
    ok(await page.evaluate(()=>{
      const s=window.__smokeGame.scene.getScene('CharacterSelect'),ui=s.cameras.getCamera('menu-ui');
      return s.selectedId==='druid'&&s.children.list.filter(o=>o.name.startsWith('selected-character-'))
        .every(o=>(o.cameraFilter&ui.id)!==0);
    }),`Выбор персонажа мышью работает после resize ${viewport.width}×${viewport.height}; фигура и посох остаются слоями фона`);
    if(viewport.width===1280||viewport.width===1100)await page.screenshot({path:`test-results/selection-full-window-${viewport.width}.png`});
    await clickNamed('CharacterSelect','back');await waitScene('MainMenu');
  }
  await page.setViewportSize(original);await check('MainMenu',original.width,original.height);
  await clickNamed('MainMenu','play');await waitScene('CharacterSelect');
}
