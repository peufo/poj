import { defineConfig } from '@playwright/test';
import { loadEnv } from 'vite';
import { e2eDatabaseName } from './src/lib/server/testing/e2e.ts';
import { appPorts, withDatabase } from './src/lib/server/testing/worktree.ts';

const env = loadEnv('production', import.meta.dirname, '');

// Port du preview tiré d'`ORIGIN` (4173 dans le checkout principal), comme dans vite.config.ts.
// Le preview reçoit sa propre origine : elle doit suivre le port réel.
const { preview } = appPorts(env.ORIGIN);
const origin = `http://localhost:${preview}`;

// Base jetable de ce lancement (`poj_e2e_<pid>`), sur le serveur de la base de test. La
// configuration est relue par chaque worker : le nom est fixé une fois, par le lanceur.
if (!env.DATABASE_URL_TEST) throw new Error('DATABASE_URL_TEST is not set (see .env.example)');
process.env.E2E_DATABASE_URL ??= withDatabase(env.DATABASE_URL_TEST, e2eDatabaseName(process.pid));

export default defineConfig({
	webServer: {
		// Playwright démarre le serveur avant `globalSetup` : la commande prépare la base.
		command: `bun scripts/e2e.ts prepare && npm run build && npm run preview -- --port ${preview}`,
		port: preview,
		timeout: 180_000,
		env: { ORIGIN: origin, DATABASE_URL: process.env.E2E_DATABASE_URL }
	},
	globalTeardown: './e2e/global-teardown.ts',
	testDir: './e2e',
	testMatch: '**/*.e2e.{ts,js}',
	reporter: 'list',
	use: { baseURL: origin }
});
