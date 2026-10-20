import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { entityEditorPlugin } from './entityEditorPlugin';

// Gameplay regression checks use the approved baseline, independent of local tuning.
export default defineConfig({ base: './', plugins: [entityEditorPlugin(resolve('scripts/fixtures/entities-baseline.json'))] });
