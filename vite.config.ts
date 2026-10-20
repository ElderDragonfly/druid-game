import { defineConfig } from 'vite';
import { entityEditorPlugin } from './tools/entityEditorPlugin';

// Относительные пути к сборке пригодятся для будущего настольного приложения.
export default defineConfig({ base: './', plugins: [entityEditorPlugin()] });
