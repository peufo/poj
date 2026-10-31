/**
 * Isolation des worktrees git : bases jetables et ports propres à chacun.
 *
 *   bun scripts/worktree.ts setup   dans un worktree : copie le `.env` du checkout principal
 *                                   s'il manque, puis y écrit ses propres `DATABASE_URL_TEST`,
 *                                   `DATABASE_URL_SANDBOX` (`poj_*_wt_<slug>`) et `ORIGIN`
 *                                   (port libre parmi 5183, 5193…). Relançable sans risque.
 *   bun scripts/worktree.ts prune   supprime les bases `poj_*_wt_*` des worktrees disparus, et
 *                                   les bases e2e (`poj_e2e_<pid>`) des lancements de
 *                                   Playwright terminés sans les supprimer (pid disparu)
 *
 * Le checkout principal garde ses bases et ses ports (5173, 5174, 4173). `setup` ne dépend
 * pas du client Prisma : il tourne avant `db:generate`, qui a besoin du `.env`.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import {
	appPorts,
	isWorktreeDatabase,
	linkedWorktree,
	listWorktrees,
	pickDevPort,
	setEnvValues,
	withDatabase,
	worktreeDatabaseName,
	worktreeSlug
} from '../src/lib/server/testing/worktree';
import { e2eDatabasePid, isProcessAlive } from '../src/lib/server/testing/e2e';

const ENV_FILE = 'apps/web/.env';
const webRoot = fileURLToPath(new URL('..', import.meta.url));

function fail(message: string): never {
	console.error(`✗ ${message}`);
	process.exit(1);
}

function readEnvFile(path: string): Record<string, string> {
	return existsSync(path) ? parse(readFileSync(path, 'utf8')) : {};
}

function setup() {
	const worktree = linkedWorktree(webRoot);
	if (!worktree) fail('Checkout principal : il garde poj_test, poj_sandbox et le port 5173.');

	const envPath = join(worktree.root, ENV_FILE);
	if (!existsSync(envPath)) {
		const mainEnv = join(worktree.mainRoot, ENV_FILE);
		if (!existsSync(mainEnv)) fail(`${mainEnv} introuvable (modèle : apps/web/.env.example)`);
		copyFileSync(mainEnv, envPath);
	}
	const content = readFileSync(envPath, 'utf8');
	const env = parse(content);
	for (const key of ['DATABASE_URL_TEST', 'DATABASE_URL_SANDBOX'] as const) {
		if (!env[key]) fail(`${key} manque dans ${envPath} (voir apps/web/.env.example)`);
	}

	const slug = worktreeSlug(worktree.root);
	const testDb = worktreeDatabaseName('test', slug);
	const sandboxDb = worktreeDatabaseName('sandbox', slug);
	const used = listWorktrees(webRoot)
		.filter((root) => root !== worktree.root)
		.map((root) => appPorts(readEnvFile(join(root, ENV_FILE)).ORIGIN).dev);
	const dev = pickDevPort(env.ORIGIN ? appPorts(env.ORIGIN).dev : undefined, used);
	const values = {
		DATABASE_URL_TEST: withDatabase(env.DATABASE_URL_TEST, testDb),
		DATABASE_URL_SANDBOX: withDatabase(env.DATABASE_URL_SANDBOX, sandboxDb),
		ORIGIN: `http://localhost:${dev}`
	};
	writeFileSync(envPath, setEnvValues(content, values));

	const ports = appPorts(values.ORIGIN);
	console.log(`✓ Worktree isolé (${envPath})
  bases        ${testDb}, ${sandboxDb}
  ports        dev ${ports.dev}, bac à sable ${ports.sandbox}, preview ${ports.preview}`);
}

async function prune() {
	const url = process.env.DATABASE_URL_TEST;
	if (!url) fail('DATABASE_URL_TEST non définie (voir .env.example)');
	const { dropDatabase, listDatabases } = await import('../src/lib/server/testing/database');

	const live = new Set(
		listWorktrees(webRoot).flatMap((root) => {
			const slug = worktreeSlug(root);
			return [worktreeDatabaseName('test', slug), worktreeDatabaseName('sandbox', slug)];
		})
	);
	/** Base e2e d'un lancement de Playwright qui ne tourne plus. */
	const finishedRun = (name: string) => {
		const pid = e2eDatabasePid(name);
		return pid !== null && !isProcessAlive(pid);
	};
	const orphans = (await listDatabases(url)).filter(
		(name) => (isWorktreeDatabase(name) && !live.has(name)) || finishedRun(name)
	);
	for (const name of orphans) {
		await dropDatabase(withDatabase(url, name));
		console.log(`✓ ${name} supprimée`);
	}
	if (orphans.length === 0) console.log('✓ Aucune base de worktree ni e2e orpheline');
}

switch (process.argv[2]) {
	case 'setup':
		setup();
		break;
	case 'prune':
		await prune();
		break;
	default:
		console.error('Usage: bun scripts/worktree.ts setup | prune');
		process.exit(1);
}
