/**
 * Base jetable des tests e2e Playwright (`E2E_DATABASE_URL`, `poj_e2e_<pid>`, fixée par
 * playwright.config.ts) :
 *
 *   bun scripts/e2e.ts prepare   la (re)crée, applique les migrations et charge la seed du
 *                                bac à sable ; lancé par la commande du serveur de preview,
 *                                avant le build (Playwright démarre le serveur avant
 *                                `globalSetup`)
 *   bun scripts/e2e.ts drop      la supprime (`e2e/global-teardown.ts`)
 *
 * Une base laissée par un lancement interrompu est supprimée par `bun run worktree:prune`.
 */
import {
	createPrismaClient,
	dropDatabase,
	migrateDatabase,
	recreateDatabase
} from '../src/lib/server/testing/database';
import { seedSandbox } from '../src/lib/server/testing/seed';

const url = process.env.E2E_DATABASE_URL;
if (!url) {
	console.error('✗ E2E_DATABASE_URL non définie (fixée par playwright.config.ts)');
	process.exit(1);
}

async function prepare(url: string) {
	// `recreateDatabase` et `seedSandbox` refusent toute base qui n'est pas jetable.
	await recreateDatabase(url);
	migrateDatabase(url);
	const db = createPrismaClient(url);
	try {
		await seedSandbox(db);
	} finally {
		await db.$disconnect();
	}
}

switch (process.argv[2]) {
	case 'prepare':
		await prepare(url);
		break;
	case 'drop':
		await dropDatabase(url);
		break;
	default:
		console.error('Usage: bun scripts/e2e.ts prepare | drop');
		process.exit(1);
}
