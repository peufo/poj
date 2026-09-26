/**
 * Exporte la spec OpenAPI de l'API Hono vers packages/api-contract/openapi.json,
 * contrat versionné dont sont générés les clients mobiles.
 *
 *   bun scripts/export-openapi.ts           écrit le contrat
 *   bun scripts/export-openapi.ts --check   échoue si le contrat versionné n'est pas à jour
 *
 * Le module de l'API est chargé via Vite (SSR) pour que les imports SvelteKit
 * ($app/*, #lib/*) soient résolus comme dans l'app ; aucune requête n'est faite à la base.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const contractPath = fileURLToPath(
	new URL('../../../packages/api-contract/openapi.json', import.meta.url)
);
const check = process.argv.includes('--check');

const server = await createServer({
	root: fileURLToPath(new URL('..', import.meta.url)),
	server: { middlewareMode: true, hmr: false, ws: false },
	appType: 'custom',
	logLevel: 'error'
});

let json: string;
try {
	const { api, openApiConfig } = await server.ssrLoadModule('/src/lib/server/api/index.ts');
	json = JSON.stringify(api.getOpenAPI31Document(openApiConfig), null, '\t') + '\n';
} finally {
	await server.close();
}

if (check) {
	const current = await readFile(contractPath, 'utf8').catch(() => '');
	if (current !== json) {
		console.error(
			'✗ packages/api-contract/openapi.json est obsolète : lancer `bun run api:export`.'
		);
		process.exit(1);
	}
	console.log('✓ Contrat OpenAPI à jour.');
} else {
	await writeFile(contractPath, json);
	console.log(`✓ Contrat OpenAPI écrit dans ${contractPath}`);
}
process.exit(0);
