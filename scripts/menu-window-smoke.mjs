/** Menus fill the same browser window as gameplay, without cropping controls. */
export async function testMenuWindow(page,ok,clickNamed,waitScene) {
  const original=page.viewportSize();
  ok(await page.evaluate(async()=>{
    const read=async path=>{const i=new Image();i.src=path;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const ctx=c.getContext('2d');ctx.drawImage(i,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
    const old=await read('/docs/art/selection-camp-atmosphere-v1/environment-reference.png');
    const current=await read('/docs/art/selection-camp-seam-v1/background.png');
    const fireClean=await read('/docs/art/selection-camp-seam-v1/fire-clean-mask.png');
    let preserved=true,before=0,after=0;
    for(let y=0;y<528;y++) for(let x=0;x<960;x++) for(let c=0;c<4;c++) {
      const i=(y*960+x)*4+c;
      const cleaned=x>=584&&x<712&&y>=282&&y<430&&fireClean[((y-282)*128+x-584)*4]>0;
      if((x<503||x>553)&&!cleaned)preserved&&=old[i]===current[i];
      if(x===525&&y<245&&c<3){before+=Math.abs(old[i]-old[i-4]);after+=Math.abs(current[i]-current[i-4]);}
    }
    return preserved&&after<before*.5;
  }),'Шов x=525 сглажен без замены остального лагеря; перепад вдоль старой вертикальной границы уменьшен более чем вдвое');
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
      const buttons=s.children.list.filter(o=>o.name==='settings'||o.name==='settings-back'||o.name==='play'||o.name==='exit'||o.name==='back'||o.name==='continue-run'||o.name==='music-toggle'||o.name==='music-volume'||
        o.name==='start-run'||o.name.startsWith('character-'));
      const controls=buttons.every(button=>{
        const r=button.getBounds(),a=project(r.left,r.top,ui),b=project(r.right,r.bottom,ui);
        return a.x>=-1&&a.y>=-1&&b.x<=s.scale.width+1&&b.y<=s.scale.height+1&&
          !!(button.cameraFilter&c.id)&&!(button.cameraFilter&ui.id);
      });
      const canvas=s.game.canvas.getBoundingClientRect();
      return{covered:tl.x<=1&&tl.y<=1&&br.x>=s.scale.width-1&&br.y>=s.scale.height-1,
        audioPlacement:key==='Settings'?!!s.children.getByName('music-toggle')&&!!s.children.getByName('music-volume'):
          !s.children.getByName('music-toggle')&&!s.children.getByName('music-volume'),
        controls,layer:!(bg.cameraFilter&c.id)&&!!(bg.cameraFilter&ui.id),
        cameras:s.cameras.cameras.length,canvas:canvas.width===innerWidth&&canvas.height===innerHeight};
    },key);
    ok(result.covered&&result.canvas&&result.layer&&result.controls&&result.audioPlacement&&result.cameras===2,
      `${key} ${width}×${height}: фон закрывает всё окно, кнопки видимы полностью и не дублируются`);
  };
  for(const viewport of [{width:1280,height:720},{width:1920,height:540},{width:1100,height:820},{width:720,height:900}]){
    await page.setViewportSize(viewport);
    await check('MainMenu',viewport.width,viewport.height);
    if(viewport.width===1280)await page.screenshot({path:'test-results/main-menu-full-window.png'});
    await clickNamed('MainMenu','settings');await waitScene('Settings');
    await check('Settings',viewport.width,viewport.height);
    if(viewport.width===1280)await page.screenshot({path:'test-results/settings.png'});
    await clickNamed('Settings','settings-back');await waitScene('MainMenu');
    await clickNamed('MainMenu','play');await waitScene('CharacterSelect');
    await check('CharacterSelect',viewport.width,viewport.height);
    ok(await page.evaluate(()=>{
      const s=window.__smokeGame.scene.getScene('CharacterSelect'),bg=s.children.getByName('camp-background');
      return bg.texture.key==='selection-camp-unified'&&bg.displayWidth===960&&bg.displayHeight===540&&
        !s.children.getByName('selection-camp-plate')&&s.children.getByName('selected-character-preview').texture.key==='druid-camp';
    }),`Выбор ${viewport.width}×${viewport.height}: окружение единое, без вертикальной накладки и нижней полосы; друид отдельным слоем`);
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
