import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { normalizePath, type Plugin } from 'vite';
import { validateEntityData } from '../src/data/entitySchema';

/** Dev-only endpoint. Fixed destination, strict schema, optimistic concurrency.
 * No file-writing endpoint is included in the production game. */
export function entityEditorPlugin(file = resolve('src/data/entities.json')): Plugin {
  file = normalizePath(file);
  let pending: Promise<unknown> = Promise.resolve();
  return {
    name: 'druid-local-entity-editor', apply: 'serve',
    // Allows integration tests to use a disposable data file, never the user's balance.
    resolveId(source, importer) {
      if (source === './entities.json' && importer?.endsWith('/src/data/entityBalance.ts')) return file;
    },
    handleHotUpdate(ctx) {
      if (ctx.file === file) {
        for (const mod of ctx.modules) ctx.server.moduleGraph.invalidateModule(mod);
        return [];
      } // Custom update keeps the current run alive.
    },
    configureServer(server) {
      let lastRevision = '';
      const load = async () => {
        const raw = await readFile(file, 'utf8'), data = JSON.parse(raw);
        const errors = validateEntityData(data);
        if (errors.length) throw new Error(errors.join('\n'));
        return { data, revision: createHash('sha256').update(raw).digest('hex') };
      };
      const broadcast = (snapshot: Awaited<ReturnType<typeof load>>) => {
        if (snapshot.revision === lastRevision) return;
        lastRevision = snapshot.revision;
        server.ws.send({ type: 'custom', event: 'entity-data:updated', data: snapshot });
      };
      let reloadTimer: ReturnType<typeof setTimeout>;
      const changed = (path: string) => {
        if (path !== file) return;
        clearTimeout(reloadTimer);
        // Editors may truncate then rewrite or rename the file. Read after it
        // settles; this also avoids losing a rapid follow-up save to the file
        // watcher's per-path change throttling. API saves broadcast immediately.
        reloadTimer = setTimeout(() => { void load().then(broadcast).catch(() => {
          lastRevision = ''; // A repair to the same last-valid contents must still clear the error in clients.
          server.ws.send({ type: 'custom', event: 'entity-data:invalid', data: { message: 'Файл характеристик повреждён. Игра продолжает использовать последние корректные данные.' } });
        }); }, 150);
      };
      server.watcher.add(file); server.watcher.on('change', changed); server.watcher.on('add', changed);
      server.httpServer?.once('close', () => {
        clearTimeout(reloadTimer);
        server.watcher.off('change', changed); server.watcher.off('add', changed);
      });
      server.middlewares.use('/__editor/entities', async (req, res) => {
        const send = (code: number, body: unknown) => {
          res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body));
        };
        const peer = req.socket.remoteAddress;
        let host: URL;
        try { host = new URL(`http://${req.headers.host}`); } catch { send(403, { error: 'Недопустимый адрес.' }); return; }
        const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(host.hostname);
        const localPeer = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
        if (!localHost || !localPeer || (req.headers.origin && req.headers.origin !== host.origin)) {
          send(403, { error: 'Редактор доступен только локально с того же адреса, что и игра.' }); return;
        }
        if (req.method === 'GET') {
          try { send(200, await load()); } catch { send(422, { error: 'Не удалось прочитать корректный src/data/entities.json. Проверьте файл.' }); }
          return;
        }
        if (req.method !== 'PUT') { res.setHeader('Allow', 'GET, PUT'); send(405, { error: 'Метод не поддерживается.' }); return; }
        if (!req.headers.origin || req.headers['content-type']?.split(';')[0] !== 'application/json') {
          send(403, { error: 'Сохранение разрешено только из локального редактора.' }); return;
        }
        let raw = '', size = 0;
        try {
          for await (const chunk of req) {
            size += Buffer.byteLength(chunk);
            if (size > 65536) { send(413, { error: 'Слишком большой запрос.' }); return; }
            raw += chunk;
          }
          const body = JSON.parse(raw), errors = validateEntityData(body?.data);
          if (errors.length) { send(422, { error: errors.join('\n') }); return; }
          const save = async () => {
            const current = await load();
            if (body.revision !== current.revision) {
              send(409, { error: 'Данные изменились в другой вкладке или файле. Сначала загрузите сохранённые данные.' }); return;
            }
            const temporary = `${file}.${randomUUID()}.tmp`;
            try {
              await writeFile(temporary, `${JSON.stringify(body.data, null, 2)}\n`, { flag: 'wx' });
              await rename(temporary, file);
            } finally { await unlink(temporary).catch(() => {}); }
            const snapshot = await load(); broadcast(snapshot); send(200, snapshot);
          };
          const task = pending.then(save); pending = task.catch(() => {}); await task;
        } catch {
          send(400, { error: 'Сохранение не выполнено. Проверьте формат данных и доступ к файлу; ваши значения оставлены в форме.' });
        }
      });
    },
  };
}
