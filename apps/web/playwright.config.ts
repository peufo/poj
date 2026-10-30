import { defineConfig } from '@playwright/test';
import { loadEnv } from 'vite';
import { appPorts } from './src/lib/server/testing/worktree.ts';

// Port du preview tiré d'`ORIGIN` (4173 dans le checkout principal), comme dans vite.config.ts.
// Le preview reçoit sa propre origine : elle doit suivre le port réel.
const { preview } = appPorts(loadEnv('production', import.meta.dirname, 'ORIGIN').ORIGIN);

export default defineConfig({
	webServer: {
		command: `npm run build && npm run preview -- --port ${preview}`,
		port: preview,
		env: { ORIGIN: `http://localhost:${preview}` }
	},
	testMatch: '**/*.e2e.{ts,js}'
});
