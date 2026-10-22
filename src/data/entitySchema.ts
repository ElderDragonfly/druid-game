import type defaults from './entities.json';

export type EntityData = typeof defaults;
export type EntityId = 'druid' | 'wolf' | 'mouse';
export interface EntityField {
  entity: EntityId; path: string; label: string; group: string;
  min: number; max: number; step: number; unit: string; help: string; integer?: boolean;
}
const fields: EntityField[] = [];
function field(entity: EntityId, path: string, label: string, group: string,
  min: number, max: number, step: number, unit: string, help: string, integer = false) {
  fields.push({ entity, path, label, group, min, max, step, unit, help, integer });
}
field('druid', 'health', 'Стартовое здоровье', 'Характеристики', 1, 10, 1, 'HP', 'Максимум здоровья. В текущем забеге сохраняется число потерянных HP; живой друид не погибнет от настройки.', true);
field('druid', 'speed', 'Скорость ходьбы', 'Характеристики', 0, 4, .1, '×', '1 = 146⅔ игровых единиц/с. Темп шагов следует за скоростью.');
field('druid', 'attackRate', 'Скорострельность', 'Атака', 0, 4, .1, '×', '1 = один каст за 1005 мс; 2 = вдвое быстрее. Жёлудь появляется на 75% жеста.');
field('druid', 'range', 'Дальность', 'Атака', 0, 4, .1, '×', '1 = овал 384 × 216 игровых единиц. Новая дальность действует на следующие желуди.');
field('druid', 'damage', 'Урон желудя', 'Атака', 0, 100, 1, 'HP', 'Сколько HP снимает попадание.', true);
field('druid', 'projectileSpeed', 'Скорость желудя', 'Атака', 0, 5, .1, '×', '1 = 146⅔ единиц/с. Изменяется скорость новых снарядов.');
field('wolf', 'health', 'Максимум здоровья', 'Характеристики', 1, 100, 1, 'HP', 'Сохраняется число потерянных HP. Погибшие волки не оживают.', true);
for (const [key, label] of [['walkSpeed', 'Скорость прогулки'], ['runSpeed', 'Скорость погони']])
  field('wolf', key, label, 'Характеристики', 0, 4, .1, '×', '1 = базовая скорость друида (146⅔ единиц/с), независимо от его текущих усилений.');
field('wolf', 'damage', 'Урон укуса', 'Атака', 0, 10, 1, 'HP', '0 позволяет проверять атаки без потери здоровья друида.', true);
for (const entity of ['wolf', 'mouse'] as const) {
  field(entity, 'population.min', 'Минимальное количество', 'Генерация · новая поляна', 0, entity === 'wolf' ? 32 : 24, 1, 'шт.', 'Случайное число на всю локацию, без квот по экранам. Только при новой генерации.', true);
  field(entity, 'population.max', 'Максимальное количество', 'Генерация · новая поляна', 0, entity === 'wolf' ? 32 : 24, 1, 'шт.', 'Генератор старается разместить выбранное число в свободных местах; иногда может поместиться меньше.', true);
}
for (const [key, label, max, help] of [
  ['detectionX', 'Обнаружение друида по горизонтали', 1500, 'Горизонтальная полуось овала обнаружения вокруг волка.'],
  ['detectionY', 'Обнаружение друида по вертикали', 1000, 'Вертикальная полуось. Уже замеченного друида волк продолжает преследовать.'],
  ['projectileDetectionX', 'Обнаружение желудя по горизонтали', 1500, 'Пролёт желудя в этом овале привлекает волка.'],
  ['projectileDetectionY', 'Обнаружение желудя по вертикали', 1000, 'Вертикальная полуось овала обнаружения снаряда.'],
  ['wanderMin', 'Минимальная прогулка', 500, 'Длина следующего случайного маршрута.'],
  ['wanderMax', 'Максимальная прогулка', 800, 'Длина следующего случайного маршрута.'],
  ['attackGap', 'Дистанция укуса от коллизии', 40, 'Дополнительный зазор от границ тел; не меняет размеры коллизии.'],
] as const) field('wolf', `behavior.${key}`, label, 'Поведение', 0, max, .1, 'ед.', help);
for (const [key, label, max] of [
  ['idleMinMs', 'Минимальная пауза', 20000], ['idleMaxMs', 'Максимальная пауза', 20000],
  ['attackMs', 'Длительность укуса', 5000], ['impactMs', 'Момент попадания', 4999],
  ['recoveryMs', 'Пауза после укуса', 10000], ['pathRefreshMs', 'Обновление маршрута', 3000],
] as const) field('wolf', `behavior.${key}`, label, 'Время поведения', 0, max, .1, 'мс',
  key === 'impactMs' ? 'Время от начала укуса до проверки попадания. Должно быть меньше длительности укуса.' :
    key === 'attackMs' ? 'Длительность текущего и следующих укусов. Текущий таймер не сбрасывается; темп анимации подстраивается.' :
    key === 'pathRefreshMs' ? 'Порог следующего пересчёта маршрута. Меньше — чаще пересчитывать, больше — реже.' :
    'Новые паузы и маршруты используют новое значение. Уже начатые таймеры завершаются своим ходом.');
field('mouse', 'speed', 'Скорость пробежки', 'Характеристики', 0, 400, .1, 'ед./с', 'Мышь мирная: не атакует и не имеет боевого HP. Темп бега следует за скоростью.');
field('mouse', 'runDistance.min', 'Минимальная пробежка', 'Поведение', 0, 500, .1, 'ед.', 'Длина следующего маршрута.');
field('mouse', 'runDistance.max', 'Максимальная пробежка', 'Поведение', 0, 800, .1, 'ед.', 'Длина следующего маршрута.');
field('mouse', 'lookMs', 'Осматривание стоя', 'Поведение', 0, 20000, .1, 'мс', 'Как долго мышь осматривается перед следующей пробежкой.');
export const ENTITY_FIELDS: readonly EntityField[] = fields;

export function readField(data: EntityData, entity: EntityId, path: string): number {
  let value: unknown = data[entity];
  for (const key of path.split('.')) value = (value as Record<string, unknown>)[key];
  return value as number;
}
export function writeField(data: EntityData, entity: EntityId, path: string, value: number) {
  let target = data[entity] as unknown as Record<string, unknown>;
  const keys = path.split('.');
  for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
  target[keys.at(-1)!] = value;
}
/** Same strict schema is used by the form, file endpoint and live game. */
export function validateEntityData(value: unknown): string[] {
  const errors: string[] = [], data = value as EntityData;
  const expected = new Set(['version', ...fields.map(f => `${f.entity}.${f.path}`)]);
  const walk = (v: unknown, path: string) => {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      if (path && ![...expected].some(key => key.startsWith(`${path}.`))) errors.push(`Неизвестный раздел: ${path}`);
      for (const [key, child] of Object.entries(v)) walk(child, path ? `${path}.${key}` : key);
    } else if (!expected.has(path)) errors.push(`Неизвестное поле: ${path || '(корень)'}`);
  };
  walk(value, '');
  if (data?.version !== 1) errors.push('Неподдерживаемая версия данных.');
  for (const f of fields) {
    let n: number;
    try { n = readField(data, f.entity, f.path); } catch { n = NaN; }
    if (typeof n !== 'number' || !Number.isFinite(n) || n < f.min || n > f.max || (f.integer && !Number.isInteger(n)))
      errors.push(`${f.entity}: «${f.label}» — ${f.integer ? 'целое число' : 'число'} от ${f.min} до ${f.max}.`);
  }
  if (errors.length) return errors;
  const pair = (min: number, max: number, label: string) => { if (min > max) errors.push(`${label}: минимум больше максимума.`); };
  pair(data.wolf.population.min, data.wolf.population.max, 'Количество волков');
  pair(data.mouse.population.min, data.mouse.population.max, 'Количество мышей');
  pair(data.wolf.behavior.wanderMin, data.wolf.behavior.wanderMax, 'Прогулка волка');
  pair(data.wolf.behavior.idleMinMs, data.wolf.behavior.idleMaxMs, 'Пауза волка');
  pair(data.mouse.runDistance.min, data.mouse.runDistance.max, 'Пробежка мыши');
  if (data.wolf.behavior.impactMs >= data.wolf.behavior.attackMs) errors.push('Попадание волка должно происходить до конца укуса.');
  return errors;
}
