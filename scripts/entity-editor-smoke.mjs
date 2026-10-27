import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer, runnerImport } from 'vite';
import { chromium } from 'playwright-core';

// Every write goes into an ignored temporary fixture. Never alter the user's balance.
const root=resolve('.'), folder=await mkdtemp(resolve('.editor-test-'));
const file=resolve(folder,'entities.json'), original=await readFile('src/data/entities.json','utf8');
const baselineSource=await readFile('scripts/fixtures/entities-baseline.json','utf8');
await writeFile(file,baselineSource);
const {module:{entityEditorPlugin}}=await runnerImport(resolve('tools/entityEditorPlugin.ts'));
const server=await createServer({root,configFile:false,plugins:[entityEditorPlugin(file)],server:{host:'127.0.0.1',port:4179,strictPort:true,fs:{allow:[root]}}});
let browser, passed=0;
const ok=(condition,message)=>{assert.ok(condition,message);console.log(`PASS: ${message}`);passed++;};
try {
  await server.listen(); const base='http://127.0.0.1:4179';
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-webgl']});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}), errors=[];
  context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
  const editor=await context.newPage(); await editor.goto(`${base}/editor.html`);
  await editor.waitForFunction(()=>document.querySelector('#status').textContent.includes('загружены'));
  const choose=async id=>{await editor.locator(`[data-entity="${id}"]`).click();};
  const fill=async(name,value)=>editor.locator(`#fields [name="${name}"]`).fill(String(value));
  const read=async()=>{const r=await fetch(`${base}/__editor/entities`);return r.json();};
  const put=(body,origin=base)=>fetch(`${base}/__editor/entities`,{method:'PUT',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
  let baseline=await read();
  ok(JSON.stringify(baseline.data)===JSON.stringify(JSON.parse(baselineSource)),'Редактор читает общий файл; исходный баланс сохранён');
  await choose('wolf');
  ok(await editor.locator('[name="runSpeed"]').getAttribute('min')==='0'&&
    await editor.locator('[name="runSpeed"]').getAttribute('step')==='0.1'&&
    Number(await editor.locator('[name="runSpeed"]').inputValue())===.9,'Погоня волка начинается с 0,9; минимум поля 0, шаг 0,1');
  await editor.locator('[name="runSpeed"]').focus();await editor.locator('[name="runSpeed"]').press('ArrowDown');
  ok(Number(await editor.locator('[name="runSpeed"]').inputValue())===.8,'Стрелка поля уменьшает скорость с 0,9 до 0,8');
  await editor.locator('#discard').click();await choose('druid');
  ok(await editor.evaluate(async()=>{
    const {ENTITY_FIELDS}=await import('/src/data/entitySchema.ts');
    return ENTITY_FIELDS.every(f=>f.integer?f.step===1:f.min===0&&f.step===.1);
  }),'Все дробные параметры имеют минимум 0 и шаг 0,1; HP и количества сохраняют целочисленный шаг');
  const game=await context.newPage();await game.goto(base);
  await game.evaluate(async()=>{window.__game=(await import('/src/main.ts')).game;});
  await game.waitForFunction(()=>window.__game.scene.isActive('MainMenu'));
  await game.evaluate(()=>window.__game.scene.getScene('MainMenu').scene.start('Room',{seed:0}));
  await game.waitForFunction(()=>window.__game.scene.getScene('Room').world?.wolves.length===4);
  await game.evaluate(()=>{
    const s=window.__game.scene.getScene('Room');s.physics.pause();window.__originalGame=window.__game;window.__originalPlayer=s.player;
    s.player.actorState.health=2;s.player.actorState.speed*=2;s.world.wolves[0].actorState.health=1;
  });
  await editor.bringToFront(); await fill('speed',.8); await fill('health',5); await fill('range',1.2);await fill('attackRate',1.25);await fill('damage',2);
  ok(await editor.locator('#save').isEnabled(),'Изменения чисел создают черновик и включают сохранение');
  await choose('wolf');await fill('health',4);await fill('runSpeed',.8);await fill('damage',0);
  await fill('population.min',2);await fill('population.max',2);await fill('behavior.detectionX',500);
  await choose('mouse');await fill('speed',135);await fill('population.min',1);await fill('population.max',1);
  await choose('druid');ok(await editor.locator('[name="speed"]').inputValue()==='.8'||Number(await editor.locator('[name="speed"]').inputValue())===.8,'Переключение карточек сохраняет общий черновик');
  await editor.locator('#save').click();await editor.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Сохранено в src/'));
  await game.waitForFunction(()=>window.__game.scene.getScene('Room').player.actorState.maxHealth===5);
  ok(await game.evaluate(()=>{
    const s=window.__game.scene.getScene('Room'),p=s.player.actorState,w=s.world.wolves[0].actorState;
    return window.__game===window.__originalGame&&s.player===window.__originalPlayer&&p.health===4&&p.maxHealth===5&&
      Math.abs(p.speed-220*2/3*2*.8)<.001&&p.range===1.2&&p.attackRate===1.25&&w.health===3&&w.maxHealth===4&&
      Math.abs(w.runSpeed-220*2/3*.8)<.001&&s.world.mice.every(m=>m.actorState.speed===135)&&s.world.wolves.length===4&&s.world.mice.length!==1;
  }),'Сохранение обновляет живых существ без reload/рестарта: HP с потерями, скорости с модификаторами, дальность и темп; популяция пока прежняя');
  baseline=await read();
  ok(JSON.parse(await readFile(file,'utf8')).druid.speed===.8&&baseline.data.wolf.behavior.detectionX===500,'Значения действительно записаны в файл, включая поведение');
  ok(await game.evaluate(async()=>{
    const {ACORN}=await import('/src/data/acorn.ts'),{WOLF}=await import('/src/data/wolf.ts');return ACORN.damage===2&&WOLF.combat.damage===0&&WOLF.behavior.detectionX===500;
  }),'Атаки и обнаружение читают те же данные, что редактор');
  const positive=await read();
  await choose('druid');
  for(const key of ['speed','attackRate','range','projectileSpeed'])await fill(key,0);
  await choose('wolf');await editor.locator('[name="runSpeed"]').focus();
  for(let i=0;i<8;i++)await editor.locator('[name="runSpeed"]').press('ArrowDown');
  ok(Number(await editor.locator('[name="runSpeed"]').inputValue())===0,'Восемь нажатий по 0,1 снижают скорость с 0,8 до нуля');
  for(const key of ['walkSpeed','behavior.detectionX','behavior.detectionY','behavior.projectileDetectionX','behavior.projectileDetectionY'])await fill(key,0);
  await choose('mouse');for(const key of ['speed','runDistance.min','runDistance.max','lookMs'])await fill(key,0);
  await editor.locator('#animation').selectOption('run');
  await editor.locator('#save').click();await editor.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Сохранено в src/'));
  await game.waitForFunction(()=>window.__game.scene.getScene('Room').player.actorState.speed===0);
  ok(await game.evaluate(async()=>{
    const s=window.__game.scene.getScene('Room'),p=s.player.actorState;
    s.player.casting.update(100,'down');
    const {isRunSave}=await import('/src/persistence/runSave.ts');
    const snapshot={version:1,savedAt:Date.now(),characterId:s.characterId,layout:structuredClone(s.layout),
      player:s.player.snapshot(),camera:{x:s.cameras.main.midPoint.x,y:s.cameras.main.midPoint.y},world:s.world.snapshot(),shots:[]};
    return p.speed===0&&p.range===0&&p.attackRate===0&&!s.player.casting.active&&
      s.world.wolves.every(w=>w.actorState.runSpeed===0&&w.actorState.walkSpeed===0&&!w.behavior.detects(w,s.player))&&
      s.world.mice.every(m=>m.actorState.speed===0&&Number.isFinite(m.behavior.runTimeLimit))&&isRunSave(snapshot);
  }),'Нули применяются без Infinity/NaN: перемещение и каст отключены, таймеры конечны, забег можно сохранить');
  const zero=await read();ok((await put({revision:zero.revision,data:positive.data})).status===200,'Положительные характеристики восстанавливаются после нулевых');
  await game.waitForFunction(()=>window.__game.scene.getScene('Room').player.actorState.attackRate===1.25);
  ok(await game.evaluate(()=>{
    const s=window.__game.scene.getScene('Room');
    return Math.abs(s.player.actorState.speed-220*2/3*2*.8)<.001&&s.player.actorState.range===1.2&&
      s.world.wolves.every(w=>Math.abs(w.actorState.runSpeed-220*2/3*.8)<.001)&&
      s.world.mice.every(m=>m.actorState.speed===135&&Number.isFinite(m.behavior.runTimeLimit));
  }),'Переход 0 → положительное значение сохраняет модификаторы, движение и конечные таймеры');
  await editor.waitForFunction(()=>Number(document.querySelector('[name="speed"]').value)===135);
  await choose('druid');baseline=await read();
  await game.bringToFront();await game.keyboard.press('r');
  await game.waitForFunction(()=>window.__game.scene.getScene('Room').player!==window.__originalPlayer);
  ok(await game.evaluate(()=>{
    const s=window.__game.scene.getScene('Room');s.physics.pause();return s.player.actorState.health===5&&s.world.wolves.length>=3&&s.world.wolves.length<=4&&s.world.mice.length===1;
  }),'R создаёт новую поляну с новым стартовым HP и диапазонами количества');
  const freshGame=await context.newPage();await freshGame.goto(base);
  await freshGame.waitForFunction(async()=>{const {entityData}=await import('/src/data/entityBalance.ts');return entityData.druid.health===5&&entityData.druid.speed===.8;});
  ok(true,'Новая вкладка игры загружает сохранённый баланс, не старый кеш');await freshGame.close();
  await choose('bear');
  await game.evaluate(()=>{window.__game.scene.getScene('Room').world.bear.actorState.health=4;});
  await fill('health',7);await fill('walkSpeed',.4);await fill('runSpeed',.7);await fill('damage',0);
  await editor.locator('#save').click();
  await game.waitForFunction(()=>{
    const b=window.__game.scene.getScene('Room').world.bear,s=b.actorState;
    return s.maxHealth===7&&s.health===6&&Math.abs(s.walkSpeed-220*2/3*.4)<.001&&Math.abs(s.runSpeed-220*2/3*.7)<.001&&b.definition.damage===0;
  });
  ok(true,'Карточка медведя сохраняет 0,4/0,7, HP с потерями, нулевой урон; текущий медведь обновляется без рестарта');
  await choose('skeleton');
  await game.evaluate(()=>{window.__game.scene.getScene('Room').world.skeletons[0].actorState.health=1;});
  await fill('health',4);await fill('walkSpeed',.2);await fill('runSpeed',.6);await fill('damage',0);
  await editor.locator('#save').click();
  await game.waitForFunction(()=>{
    const e=window.__game.scene.getScene('Room').world.skeletons[0],s=e.actorState;
    return s.maxHealth===4&&s.health===3&&Math.abs(s.walkSpeed-220*2/3*.2)<.001&&
      Math.abs(s.runSpeed-220*2/3*.6)<.001&&e.definition.damage===0;
  });
  ok(true,'Карточка скелета обновляет HP с потерями, скорости и урон в текущем забеге');
  baseline=await read();await choose('druid');
  const other=await context.newPage();await other.goto(`${base}/editor.html`);await other.waitForFunction(()=>document.querySelector('#status').textContent.includes('загружены'));
  ok(Number(await other.locator('[name="speed"]').inputValue())===.8,'Новая вкладка редактора читает сохранённые значения');
  for(const id of ['druid','wolf','mouse','forestInsect','bear','skeleton']) {
    await choose(id);
    const options=await editor.locator('#animation option').evaluateAll(list=>list.map(o=>o.value));
    const directions=await editor.locator('#direction option').evaluateAll(list=>list.map(o=>o.value));
    for(const anim of options) for(const direction of directions) {
      await editor.locator('#animation').selectOption(anim);await editor.locator('#direction').selectOption(direction);
      // Let the preview clear the previous selection before testing the new image.
      await editor.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await editor.waitForFunction(()=>{
        const data=document.querySelector('#sprite').getContext('2d').getImageData(0,0,512,384).data;let pixels=0;
        for(let i=3;i<data.length;i+=4)if(data[i])pixels++;return pixels>500;
      });
      ok(true,`${id}: ${anim}, ${direction} — реальные кадры загружаются и рисуются`);
    }
  }
  await choose('druid'); await editor.locator('#pause').click();
  await editor.waitForFunction(()=>document.querySelector('#frame').textContent.includes('пауза'));
  const before=await editor.locator('#frame').textContent();await editor.waitForTimeout(150);
  ok(await editor.locator('#frame').textContent()===before,'Пауза останавливает просмотр');
  await editor.locator('#step').click();await editor.waitForTimeout(30); // idle has one frame; choose walk to inspect steps.
  await editor.locator('#animation').selectOption('walk');await editor.locator('#step').click();await editor.waitForTimeout(50);
  ok((await editor.locator('#frame').textContent()).includes('Кадр 2 из 4'),'Можно переключать исходные кадры вручную');
  await fill('speed',-1);
  ok(await editor.locator('#save').isDisabled()&&(await editor.locator('#status').textContent()).includes('от 0 до'),'Неверная скорость не сохраняется и не зависает просмотр');
  await editor.locator('#discard').click();ok(Number(await editor.locator('[name="speed"]').inputValue())===.8,'Отмена черновика возвращает последнее сохранение');
  await fill('speed',.9);
  await game.evaluate(()=>{const s=window.__game.scene.getScene('Room');window.__deadWolf=s.world.wolves[0];window.__deadWolf.takeDamage(100);});
  const updated=structuredClone(baseline.data);updated.druid.speed=.7;updated.wolf.health=6;
  const changed=await put({revision:baseline.revision,data:updated});ok(changed.status===200,'Сохранение с актуальной ревизией принимается');
  await editor.waitForFunction(()=>document.querySelector('#status').textContent.includes('другой вкладке'));
  ok(await editor.locator('#save').isDisabled()&&Number(await editor.locator('[name="speed"]').inputValue())===.9,'Внешняя правка не затирает несохранённый черновик; конфликт виден');
  await other.waitForFunction(()=>Number(document.querySelector('[name="speed"]').value)===.7);
  ok(true,'Чистая вкладка редактора получает внешние изменения автоматически');
  const stale=await put({revision:baseline.revision,data:baseline.data});ok(stale.status===409,'Старый запрос не перезаписывает более новую версию');
  ok(await game.evaluate(()=>window.__deadWolf.actorState.health===0&&!window.__deadWolf.body.enable), 'Изменение базового HP не оживляет погибшего волка');
  editor.once('dialog',dialog=>dialog.accept());await editor.locator('#reload').click();
  await editor.waitForFunction(()=>Number(document.querySelector('[name="speed"]').value)===.7);
  ok(await editor.locator('#save').isDisabled(),'Загрузка с диска после подтверждения заменяет черновик актуальными данными');
  baseline=await read();
  for(const [mutate,label] of [
    [d=>d.druid.health=1.5,'Дробное HP'],[d=>d.mouse.population.min=25,'Неверный диапазон'],
    [d=>d.wolf.behavior.impactMs=d.wolf.behavior.attackMs,'Попадание после конца укуса'],
    [d=>d.unknown={},'Неизвестный раздел'],[d=>delete d.druid.damage,'Пропущенное поле'],[d=>d.bear.walkSpeed=-.1,'Отрицательная скорость медведя'],
  ]) {
    const data=structuredClone(baseline.data);mutate(data);ok((await put({revision:baseline.revision,data})).status===422,`${label}: сервер отклоняет некорректные данные`);
  }
  ok((await put(baseline,'https://example.com')).status===403,'Чужой Origin не может записать файл');
  ok((await put(baseline,'')).status===403,'Запись без Origin запрещена');
  ok((await read()).revision===baseline.revision,'Отклонённые запросы не меняют файл');
  // Manually saved JSON uses the same notification channel, including invalid-file recovery.
  const manual=structuredClone(baseline.data);manual.druid.speed=.6;
  await writeFile(file,JSON.stringify(manual,null,2)+'\n');
  await other.waitForFunction(()=>Number(document.querySelector('[name="speed"]').value)===.6);
  ok(await game.evaluate(()=>Math.abs(window.__game.scene.getScene('Room').player.actorState.speed-220*2/3*.6)<.001),'Ручное изменение JSON обновляет игру и чистые вкладки редактора');
  await writeFile(file,'{broken');await other.waitForFunction(()=>document.querySelector('#status').textContent.includes('повреждён'));
  ok(await game.evaluate(()=>Math.abs(window.__game.scene.getScene('Room').player.actorState.speed-220*2/3*.6)<.001),'Повреждённый файл не заменяет рабочие данные игры');
  await writeFile(file,JSON.stringify(manual,null,2)+'\n');
  await other.waitForFunction(()=>document.querySelector('#status').textContent.includes('Получены изменения'));
  ok(Number(await other.locator('[name="speed"]').inputValue())===.6,'Восстановление тех же корректных данных снимает ошибку файла');
  await editor.screenshot({path:'test-results/entity-editor.png',fullPage:true});
  await editor.setViewportSize({width:390,height:844});
  ok(await editor.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Редактор помещается в узком окне без горизонтальной прокрутки');
  ok(errors.length===0,`Нет ошибок браузера: ${errors.join('; ')}`);
  console.log(`Проверок редактора пройдено: ${passed}.`);
} finally {
  if(browser)await browser.close();await server.close();await rm(folder,{recursive:true,force:true});
  assert.equal(await readFile('src/data/entities.json','utf8'),original,'Тест не должен менять рабочие данные');
}
