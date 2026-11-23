import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { assertAppPorts } from './src/lib/server/testing/worktree.ts';

/**
 * Ports du serveur de dev et du preview, tirés d'`ORIGIN` pour qu'elle suive le port réel
 * (5173 et 4173 dans le checkout principal, ceux de `worktree:setup` dans un worktree). Un
 * port pris fait échouer le lancement au lieu de glisser vers le suivant.
 */
function appServers(mode: string) {
	const ports = assertAppPorts(loadEnv(mode, import.meta.dirname, 'ORIGIN').ORIGIN);
	return {
		server: { port: ports.dev, strictPort: true },
		preview: { port: ports.preview, strictPort: true }
	};
}

export default defineConfig(({ mode }) => ({
	// Vitest lance ses propres serveurs, sur ses propres ports.
	...(!process.env.VITEST && appServers(mode)),
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
				experimental: { async: true }
			},
			adapter: adapter(),
			// La vérification d'origine des formulaires est refaite dans `hooks.server.ts`
			// (`handleCsrf`), avec une exception pour les endpoints OAuth de serveur à serveur.
			csrf: { trustedOrigins: ['*'] },
			experimental: { remoteFunctions: true }
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					globalSetup: ['./vitest.global-setup.ts'],
					// Les tests partagent une seule base de test : un fichier à la fois. Sans
					// isolation, les modules ne sont chargés qu'une fois pour toute la suite (pas
					// d'état global ni de `vi.mock` dans les specs serveur).
					fileParallelism: false,
					isolate: false,
					// Requis par Vitest pour un projet sans parallélisme : passe après `client`.
					sequence: { groupOrder: 1 },
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
}));
