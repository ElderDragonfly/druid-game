import { ENTITY_FIELDS, readField, writeField, validateEntityData, type EntityData, type EntityId } from '../data/entitySchema';
import { SpritePreview, DIRECTIONS, ANIMATIONS } from './preview';
import './style.css';

const names: Record<EntityId, string> = { druid: 'Друид', wolf: 'Волк', mouse: 'Мышь' };
const roles = { druid: 'Игровой персонаж', wolf: 'Противник', mouse: 'Мирный обитатель' };
const descriptions = {
  druid: 'WASD — ходьба, стрелки — каст в 8 направлениях. При касте стоит; попадание прерывает жест. Жёлудь появляется на 75% каста. Анимации следуют за скоростью.',
  wolf: 'Бродит и отдыхает до обнаружения друида или желудя. Затем преследует по всей локации, обходит деревья, кусает в пределах досягаемости. Попадание останавливает на 260 мс. Труп остаётся; респавна нет.',
  mouse: 'Пробегает до случайной точки, поднимается, осматривается и опускается. Не агрится, не получает урон; друид проходит сквозь неё. Деревья блокируют путь.',
};
const facts = {
  druid: 'Коллизия тела: 20 × 25. Зазор для контакта с волком: +10 слева, +6 справа. Реакция на попадание: 400 мс. Базовая дальность: 384 × 216. Экипировка и способности пока задаются кодом.',
  wolf: 'Коллизия: 54 × 18. Масштаб рисунка: 0,75. Зазор между точками генерации: 100 ед. Тени отдельным слоем. Левый и правый ракурс используют зеркальное отражение.',
  mouse: 'Коллизия: 9⅓ × 5⅓. Масштаб рисунка: 1,25. Подъём и опускание: по 360 мс. Боевое здоровье и атака отсутствуют.',
};
const directionLabels: Record<string,string> = { down:'Вниз', up:'Вверх', left:'Влево', right:'Вправо', 'down-left':'Вниз-влево', 'down-right':'Вниз-вправо', 'up-left':'Вверх-влево', 'up-right':'Вверх-вправо' };
document.querySelector('#editor')!.innerHTML = `
<header><div><p class="eyebrow">DRUID GAME · ЛОКАЛЬНЫЙ РЕДАКТОР</p><h1>Существа</h1></div><a href="./" target="_blank" rel="noopener">Открыть игру ↗</a><a href="#guide">Как пользоваться</a></header>
<div class="toolbar"><strong id="dirty">Загрузка…</strong><div class="actions"><button id="discard" disabled>Отменить несохранённое</button><button id="reload">Загрузить с диска</button><button id="save" class="primary" disabled>Сохранить в проект</button></div></div>
<p id="status" role="status" aria-live="polite">Читаю файл характеристик…</p>
<div class="workspace"><nav aria-label="Существа">${(Object.keys(names) as EntityId[]).map(id=>`<button data-entity="${id}"><strong>${names[id]}</strong><small>${roles[id]}</small></button>`).join('')}</nav>
<section class="preview"><h2 id="name">Друид</h2><div class="stage"><canvas id="sprite" width="512" height="384" aria-label="Просмотр спрайтов"></canvas></div><p id="frame" class="muted"></p>
<div class="preview-controls"><label>Анимация<select id="animation"></select></label><label>Направление<select id="direction"></select></label></div>
<div class="actions"><button id="pause">Пауза</button><button id="step">Следующий кадр</button></div><p class="muted">Увеличенный просмотр исходных игровых кадров. Изменение формы сразу меняет темп просмотра; игра получает параметры после сохранения.</p>
<h3>Поведение</h3><p id="behavior"></p><details><summary>Скрытые и технические свойства</summary><p id="facts"></p></details><h3>Лут</h3><p>Система выпадения лута ещё не реализована. У этих существ нет таблиц выпадения.</p></section>
<section class="parameters"><h2>Параметры</h2><p class="muted">Изменения формы — черновик. «Сохранить в проект» запишет их в общий файл и отправит открытой игре.</p><form id="fields" novalidate></form></section></div>
<section id="guide" class="guide"><h2>Как пользоваться</h2><ol><li>Открой игру соседней вкладкой и начни забег.</li><li>Выбери существо слева. Измени числа справа. Анимации можно ставить на паузу и смотреть по кадрам.</li><li>Нажми «Сохранить в проект». Изменения запишутся в <code>src/data/entities.json</code>; открытая игра обновит живых существ без перезапуска.</li><li>Для нового количества волков/мышей нажми <kbd>R</kbd> в игре. Старые снаряды завершают полёт по прежней скорости и дальности; новые используют новые значения.</li></ol>
<p>Все скорости с «×» отсчитываются от 146⅔ единиц/с. Скорость друида 1 и волка 1 равны; изменение скорости друида не меняет единицу измерения. У мыши скорость указана прямо в единицах/с.</p>
<p>При изменении максимума HP сохраняется число потерянных HP, с минимумом 1 для живого существа. Погибшие не оживают. Модификаторы скорости/дальности в текущем забеге сохраняются. «Продолжить» восстанавливает записанные в сейве характеристики; для проверки новых стартовых значений создай новый забег.</p>
<p>«Отменить несохранённое» возвращает форму к последним загруженным значениям. «Загрузить с диска» перечитывает файл и отменяет черновик после подтверждения. Отменить уже сохранённое можно, вернув прежние числа и сохранив их снова.</p><p>Сохранение здесь локальное. Для передачи изменений в GitHub нужен отдельный коммит. Подробная инструкция: <code>docs/entity-editor.md</code>. Запуск: <code>npm run editor</code> или <code>npm run dev</code>.</p></section>`;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let saved: EntityData | undefined, draft: EntityData | undefined, revision = '', selected: EntityId = 'druid';
let saving = false, stale = false, invalidInput = false;
const preview = new SpritePreview(el<HTMLCanvasElement>('sprite'), ()=>draft && !validateEntityData(draft).length ? draft : saved, el('frame'));
const status = (message: string, error = false) => { el('status').textContent = message; el('status').classList.toggle('error', error); };
const dirty = () => invalidInput || JSON.stringify(saved) !== JSON.stringify(draft);
function refreshState() {
  const errors = draft ? validateEntityData(draft) : [];
  el('dirty').textContent = !draft ? 'Данные недоступны' : saving ? 'Сохраняю…' : dirty() ? 'Есть несохранённые изменения' : 'Сохранено в проекте';
  el<HTMLButtonElement>('save').disabled = !draft || !dirty() || invalidInput || errors.length > 0 || saving || stale;
  el<HTMLButtonElement>('discard').disabled = !draft || !dirty() || saving;
  el<HTMLButtonElement>('reload').disabled = saving;
  if (errors.length && !stale) status(errors.join(' '), true);
}
function renderFields() {
  if (!draft) return;
  const fields = ENTITY_FIELDS.filter(f=>f.entity===selected), groups = [...new Set(fields.map(f=>f.group))];
  el('fields').innerHTML = groups.map(group=>`<fieldset><legend>${group}</legend>${fields.filter(f=>f.group===group).map(f=>
    `<label class="field"><span>${f.label} <small>${f.unit}</small></span><input type="number" name="${f.path}" min="${f.min}" max="${f.max}" step="any" value="${readField(draft!,selected,f.path)}" inputmode="decimal"><small>${f.help}</small></label>`).join('')}</fieldset>`).join('');
  invalidInput = false;
  el('fields').querySelectorAll<HTMLInputElement>('input').forEach(input=>input.addEventListener('input', ()=>{
    writeField(draft!, selected, input.name, input.value === '' ? NaN : input.valueAsNumber);
    invalidInput = Array.from(el('fields').querySelectorAll<HTMLInputElement>('input')).some(i=>!Number.isFinite(i.valueAsNumber));
    status(stale ? 'На диске более новая версия. Сначала загрузите её, чтобы не затереть чужие изменения.' : 'Черновик изменён. Сохраните, чтобы применить к игре.', stale);
    refreshState();
  }));
}
function choose(id: EntityId) {
  // Keep drafts when switching cards, including temporarily invalid fields.
  selected = id; preview.entity = id; preview.animation = ANIMATIONS[id][0][0]; preview.reset();
  el('name').textContent = names[id]; el('behavior').textContent = descriptions[id]; el('facts').textContent = facts[id];
  document.querySelectorAll<HTMLButtonElement>('[data-entity]').forEach(b=>{
    const current = b.dataset.entity===id; b.classList.toggle('selected',current); b.setAttribute('aria-pressed',String(current));
  });
  el<HTMLSelectElement>('animation').innerHTML = ANIMATIONS[id].map(([key,label])=>`<option value="${key}">${label}</option>`).join('');
  const directions = id==='druid' ? DIRECTIONS : ['left','right'];
  if (!directions.includes(preview.direction)) preview.direction = id==='druid' ? 'down' : 'left';
  el<HTMLSelectElement>('direction').innerHTML = directions.map(key=>`<option value="${key}" ${key===preview.direction?'selected':''}>${directionLabels[key]}</option>`).join('');
  renderFields(); refreshState();
}
async function request(method = 'GET', body?: unknown) {
  let response: Response;
  try { response = await fetch('/__editor/entities', { method, cache:'no-store',
    headers: body ? { 'Content-Type':'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('Нет связи с локальным сервером. Проверьте, что npm run editor или npm run dev работает. Черновик остался в форме.'); }
  let result;
  try { result = await response.json(); } catch { throw new Error('Локальный редактор недоступен. Запустите npm run dev и откройте editor.html по адресу этого сервера.'); }
  if (!response.ok) throw new Error(result.error || 'Запрос не выполнен.');
  if (validateEntityData(result.data).length || typeof result.revision !== 'string') throw new Error('Сервер вернул некорректные данные.');
  return result as { data: EntityData; revision: string };
}
function accept(snapshot: {data: EntityData; revision: string}) {
  saved = structuredClone(snapshot.data); draft = structuredClone(saved); revision = snapshot.revision; stale = false;
  renderFields(); refreshState();
}
async function load() {
  try { accept(await request()); status('Данные загружены из проекта. Можно редактировать.'); }
  catch (error) { status((error as Error).message,true); refreshState(); }
}
el('fields').addEventListener('submit',event=>event.preventDefault());
document.querySelectorAll<HTMLButtonElement>('[data-entity]').forEach(b=>b.onclick=()=>choose(b.dataset.entity as EntityId));
el<HTMLSelectElement>('animation').onchange = event => { preview.animation=(event.target as HTMLSelectElement).value; preview.reset(); };
el<HTMLSelectElement>('direction').onchange = event => { preview.direction=(event.target as HTMLSelectElement).value as typeof preview.direction; preview.reset(); };
el('pause').onclick = () => { preview.playing=!preview.playing; el('pause').textContent=preview.playing?'Пауза':'Продолжить'; };
el('step').onclick = () => { preview.step(); el('pause').textContent='Продолжить'; };
el('discard').onclick = () => { if(saved) { draft=structuredClone(saved); renderFields(); status('Несохранённые изменения отменены.'); refreshState(); } };
el('reload').onclick = () => { if (!dirty() || confirm('Загрузить файл и отменить несохранённые изменения формы?')) void load(); };
el('save').onclick = async () => {
  if (!draft || validateEntityData(draft).length || stale || saving) return;
  saving=true; refreshState(); document.querySelectorAll<HTMLInputElement | HTMLButtonElement>('#fields input, [data-entity]').forEach(i=>i.disabled=true);
  try {
    const result = await request('PUT', {data:draft,revision}); accept(result);
    status('Сохранено в src/data/entities.json. Данные отправлены открытым вкладкам игры. Для нового количества существ нажмите R в игре.');
  } catch(error) { status((error as Error).message,true); }
  finally { saving=false; document.querySelectorAll<HTMLInputElement | HTMLButtonElement>('#fields input, [data-entity]').forEach(i=>i.disabled=false); refreshState(); }
};
window.addEventListener('beforeunload',event=>{ if(dirty()) { event.preventDefault(); event.returnValue=''; } });
if (import.meta.hot) {
  import.meta.hot.on('entity-data:updated', (snapshot: {data:EntityData;revision:string})=>{
    if (saving || (snapshot.revision===revision && !stale)) return;
    if (dirty()) { stale=true; status('Данные изменены в другой вкладке или файле. Ваш черновик сохранён в форме; загрузите данные с диска перед сохранением.',true); refreshState(); }
    else { accept(snapshot); status('Получены изменения из другой вкладки или файла.'); }
  });
  import.meta.hot.on('entity-data:invalid', ({message}: {message:string})=>{ stale=true; status(message,true); refreshState(); });
}
choose('druid'); void load();
