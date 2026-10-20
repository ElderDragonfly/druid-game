/** Check actual WebGL output at the rectangular effect boundaries, including
 * fractional camera scales like the user's wide embedded browser window. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4183','--strictPort'],{stdio:'ignore'});
let browser,passed=0;
try {
  for(let n=0;n<100;n++){try{if((await fetch('http://127.0.0.1:4183')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
    args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1540,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4183');
  await page.waitForFunction(async()=>{window.__smokeGame=(await import('/src/main.ts')).game;return window.__smokeGame.scene.isActive('MainMenu')&&window.__smokeGame.textures.exists('druid-camp');});
  assert.ok(await page.evaluate(()=>!!window.__smokeGame.renderer.gl),'Must exercise WebGL, not the Canvas fallback');
  await page.evaluate(()=>window.__smokeGame.scene.getScene('MainMenu').scene.start('CharacterSelect'));
  await page.waitForFunction(()=>window.__smokeGame.scene.getScene('CharacterSelect').children.getByName('camp-water'));
  await page.evaluate(()=>window.__smokeGame.scene.getScene('CharacterSelect').scene.pause());
  for(const viewport of [{width:1540,height:720},{width:1280,height:720},{width:1100,height:820}]) {
    await page.setViewportSize(viewport);await page.waitForTimeout(120);
    const result=await page.evaluate(async()=>{
      const game=window.__smokeGame,s=game.scene.getScene('CharacterSelect'),fire=s.children.getByName('camp-fire'),water=s.children.getByName('camp-water');
      const capture=()=>new Promise(resolve=>game.renderer.snapshot(image=>{
        const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);resolve(ctx.getImageData(0,0,c.width,c.height));
      }));
      fire.setVisible(false);water.setVisible(false);const base=await capture();
      const areas=[fire,water].map(o=>{
        const camera=s.cameras.main;
        return {x:(o.x-camera.worldView.x)*camera.zoom,y:(o.y-camera.worldView.y)*camera.zoom,w:o.width*camera.zoom,h:o.height*camera.zoom};
      });
      let edges=true,moving=false;
      // Measure each layer alone: fire legitimately crosses the water rectangle.
      for(const [effect,indices,areaIndex] of [[fire,[0,18,36],0],[water,[0,71,143],1]]) {
        effect.setVisible(true);const r=areas[areaIndex];
        for(const index of indices) {
          effect.setFrame(String(index));const current=await capture();
          const left=Math.floor(r.x),right=Math.ceil(r.x+r.w)-1,top=Math.floor(r.y),bottom=Math.ceil(r.y+r.h)-1;
          for(let y=Math.max(0,top);y<=Math.min(base.height-1,bottom);y++)for(let x=Math.max(0,left);x<=Math.min(base.width-1,right);x++) {
            const i=(y*base.width+x)*4;
            if(x===left||x===right||y===top||y===bottom)for(let c=0;c<4;c++)edges&&=current.data[i+c]===base.data[i+c];
            else if(current.data[i]!==base.data[i])moving=true;
          }
        }
        effect.setVisible(false);
      }
      return {edges,moving};
    });
    assert.ok(result.edges&&result.moving,`WebGL ${viewport.width}×${viewport.height}: animation changes inside its mask, all four rectangular edges match the backdrop`);
    console.log(`PASS: WebGL ${viewport.width}×${viewport.height}: огонь/вода движутся без прямоугольных границ`);passed++;
  }
  assert.deepEqual(errors,[]);console.log(`Проверок WebGL пройдено: ${passed}.`);
} finally {if(browser)await browser.close();server.kill();}
