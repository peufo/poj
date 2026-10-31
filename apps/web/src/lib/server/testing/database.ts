// Outils de base de données jetable (tests et bac à sable). Jamais importés par le code
// de prod (règle ESLint) ; utilisables hors SvelteKit, depuis Vitest comme depuis Bun.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../db/generated/prisma/client';
import type { Db } from '../domain/index';
import { e2eDatabasePid } from './e2e';
import { isWorktreeDatabase, linkedWorktree, withDatabase, type Worktree } from './worktree';

const webRoot = fileURLToPath(new URL('../../../..', import.meta.url));

export function createPrismaClient(connectionString: string): Db {
	return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export function databaseName(url: string): string {
	return decodeURIComponent(new URL(url).pathname.slice(1));
}

/** Même serveur et même base, quelle que soit l'écriture de l'URL. */
function sameDatabase(a: string, b: string): boolean {
	const key = (url: string) => {
		const u = new URL(url);
		return `${u.hostname}:${u.port || '5432'}/${databaseName(url)}`;
	};
	return a === b || key(a) === key(b);
}

/**
 * Seules bases que les outils destructifs (remise à zéro, seed) acceptent de toucher :
 * `poj_test`, `poj_sandbox` et leurs variantes de worktree (`poj_test_wt_<slug>`), et les
 * bases e2e d'un lancement de Playwright (`poj_e2e_<pid>`, voir `e2e.ts`). Dans un worktree
 * (`worktree`, détecté par défaut), pas celles du checkout principal (`.env` copié sans
 * `bun run worktree:setup`).
 */
export function assertDisposableName(name: string, worktree?: Worktree | null): void {
	if (isWorktreeDatabase(name) || e2eDatabasePid(name) !== null) return;
	if (name !== 'poj_test' && name !== 'poj_sandbox') {
		throw new Error(
			`Refusing to touch database "${name}": only poj_test, poj_sandbox, their worktree variants (poj_test_wt_<slug>) and e2e runs (poj_e2e_<pid>) are disposable`
		);
	}
	if (worktree === undefined ? linkedWorktree() : worktree) {
		throw new Error(
			`Database "${name}" belongs to the main checkout: run \`bun run worktree:setup\` in this worktree`
		);
	}
}

/**
 * Garde-fou avant toute opération destructive : refuse la base de dev (`devUrl`, en
 * pratique `DATABASE_URL`) et toute base qui n'est pas explicitement jetable.
 */
export function assertDisposableDatabase(
	url: string,
	{ devUrl, worktree }: { devUrl?: string; worktree?: Worktree | null } = {}
): void {
	if (devUrl && sameDatabase(url, devUrl)) {
		throw new Error('Refusing to touch the development database (DATABASE_URL)');
	}
	assertDisposableName(databaseName(url), worktree);
}

/** Exécute `fn` connecté à la base d'administration `postgres` du même serveur. */
async function withAdmin<T>(url: string, fn: (admin: Db) => Promise<T>): Promise<T> {
	const admin = createPrismaClient(withDatabase(url, 'postgres'));
	try {
		return await fn(admin);
	} finally {
		await admin.$disconnect();
	}
}

/** Crée la base si elle n'existe pas. Renvoie vrai si elle vient d'être créée. */
export async function ensureDatabase(url: string): Promise<boolean> {
	const name = databaseName(url);
	assertDisposableName(name);
	return withAdmin(url, async (admin) => {
		const rows = await admin.$queryRaw<
			unknown[]
		>`SELECT 1 FROM pg_database WHERE datname = ${name}`;
		if (rows.length > 0) return false;
		await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
		return true;
	});
}

/** Noms des bases du serveur désigné par `url`. */
export async function listDatabases(url: string): Promise<string[]> {
	const rows = await withAdmin(
		url,
		(admin) => admin.$queryRaw<{ datname: string }[]>`SELECT datname FROM pg_database`
	);
	return rows.map((row) => row.datname);
}

/** Supprime la base (en coupant les connexions ouvertes) si elle existe. */
export async function dropDatabase(url: string): Promise<void> {
	const name = databaseName(url);
	assertDisposableName(name);
	await withAdmin(url, (admin) =>
		admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
	);
}

/** Supprime (en coupant les connexions ouvertes) puis recrée la base, vide. */
export async function recreateDatabase(url: string): Promise<void> {
	await dropDatabase(url);
	await withAdmin(url, (admin) =>
		admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName(url)}"`)
	);
}

/**
 * Vrai si toutes les migrations locales sont appliquées, à l'identique (même nom, même
 * somme SHA-256 que celle que Prisma enregistre) : `migrate deploy` peut alors être évité.
 */
export async function migrationsUpToDate(url: string): Promise<boolean> {
	const dir = join(webRoot, 'prisma/migrations');
	const names = (await readdir(dir, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
	const local = await Promise.all(
		names.map(async (name) => {
			const sql = await readFile(join(dir, name, 'migration.sql'));
			return `${name}:${createHash('sha256').update(sql).digest('hex')}`;
		})
	);

	const db = createPrismaClient(url);
	try {
		const [{ exists }] = await db.$queryRaw<{ exists: boolean }[]>`
			SELECT to_regclass('_prisma_migrations') IS NOT NULL AS exists`;
		if (!exists) return false;
		const applied = await db.$queryRaw<{ migration_name: string; checksum: string }[]>`
			SELECT migration_name, checksum FROM _prisma_migrations
			WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
		const key = (list: string[]) => [...list].sort().join('\n');
		return key(local) === key(applied.map((m) => `${m.migration_name}:${m.checksum}`));
	} finally {
		await db.$disconnect();
	}
}

/** Applique les migrations Prisma (`migrate deploy`) sur la base désignée. */
export function migrateDatabase(url: string): void {
	execFileSync('bunx', ['prisma', 'migrate', 'deploy'], {
		cwd: webRoot,
		stdio: ['ignore', 'ignore', 'inherit'],
		env: { ...process.env, DATABASE_URL: url }
	});
}

/** Vide toutes les tables applicatives (métier et auth) en une requête. */
export async function resetDatabase(db: Db): Promise<void> {
	await db.$executeRawUnsafe(`
		DO $$ BEGIN
			EXECUTE (
				SELECT 'TRUNCATE ' || string_agg(format('%I', tablename), ', ') || ' CASCADE'
				FROM pg_tables
				WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'
			);
		END $$
	`);
}
