import initial from './entities.json';
import { validateEntityData, type EntityData } from './entitySchema';

export let entityData: EntityData = structuredClone(initial);
type Listener = (next: EntityData, previous: EntityData) => void;
const listeners = new Set<Listener>();
export function onEntityDataChanged(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function apply(data: EntityData) {
  if (validateEntityData(data).length || JSON.stringify(data) === JSON.stringify(entityData)) return;
  const previous = entityData;
  entityData = structuredClone(data);
  for (const listener of listeners) listener(entityData, previous);
}
if (import.meta.hot) {
  let generation = 0;
  const sync = () => {
    const request = ++generation;
    void fetch('/__editor/entities', { cache: 'no-store' }).then(response => response.ok ? response.json() : null)
      .then(snapshot => { if (snapshot && request === generation) apply(snapshot.data); }).catch(() => {});
  };
  sync();
  window.addEventListener('focus', sync);
  import.meta.hot.on('vite:ws:connect', sync);
  import.meta.hot.dispose(() => window.removeEventListener('focus', sync));
  import.meta.hot.on('entity-data:updated', ({ data }: { data: EntityData }) => { generation++; apply(data); });
}
