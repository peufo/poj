/**
 * Bac à sable manuel : base `poj_sandbox` (`DATABASE_URL_SANDBOX`, `poj_sandbox_wt_<slug>`
 * dans un worktree), isolée de la base de dev, chargée avec la seed de
 * `src/lib/server/testing/seed.ts`.
 *
 *   bun scripts/sandbox.ts reset   (re)crée la base vide, applique les migrations, charge la seed
 *   bun scripts/sandbox.ts seed    recharge seulement la seed (vide d'abord toutes les tables)
 *   bun scripts/sandbox.ts dev     lance `vite dev` sur le port d'`ORIGIN` + 1 (5174 dans le
 *                                  checkout principal), branché sur la sandbox
 *
 * Bun charge `.env` : seules `DATABASE_URL_SANDBOX` (cible), `DATABASE_URL` (base de dev,
 * pour le garde-fou) et `ORIGIN` (ports) sont lues. Le `.env` n'est jamais modifié.
 */
import { spawn } from 'node:child_process';
import { createCardsService, createReviewsService, type Db } from '../src/lib/server/domain/index';
import {
	assertDisposableDatabase,
	createPrismaClient,
	databaseName,
	migrateDatabase,
	recreateDatabase
} from '../src/lib/server/testing/database';
import { SANDBOX_ACCOUNT, seedSandbox } from '../src/lib/server/testing/seed';
import { assertAppPorts } from '../src/lib/server/testing/worktree';

const PORT = assertAppPorts(process.env.ORIGIN).sandbox;

const url = sandboxUrl();
assertDisposableDatabase(url, { devUrl: process.env.DATABASE_URL });

/** Base du bac à sable ; arrête le script si elle n'est pas définie. */
function sandboxUrl(): string {
	const url = process.env.DATABASE_URL_SANDBOX;
	if (!url) {
		console.error('✗ DATABASE_URL_SANDBOX non définie (voir .env.example)');
		process.exit(1);
	}
	return url;
}

async function seed() {
	const db = createPrismaClient(url);
	try {
		const now = new Date();
		const { userId } = await seedSandbox(db, { now });
		await summarize(db, userId, now);
	} finally {
		await db.$disconnect();
	}
}

async function summarize(db: Db, userId: string, now: Date) {
	const [stats, next, deleted, newReviews, answers] = await Promise.all([
		createCardsService(db).stats(userId, now),
		createReviewsService(db).next(userId, now),
		db.card.count({ where: { deletedAt: { not: null } } }),
		db.review.count({ where: { state: 'new', card: { deletedAt: null } } }),
		db.reviewLog.count()
	]);
	const dueNow = next.review ? next.remaining : 0;
	console.log(`
✓ Bac à sable prêt (${databaseName(url)})
  compte       ${SANDBOX_ACCOUNT.email} / ${SANDBOX_ACCOUNT.password}
  cartes       ${stats.totalCards} (+ ${deleted} supprimée)
  révisions    ${dueNow} à présenter maintenant, ${stats.dueToday} dues aujourd'hui, ${newReviews} neuves
  historique   ${answers} réponses`);
}

function dev() {
	const child = spawn('bunx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], {
		stdio: 'inherit',
		env: { ...process.env, DATABASE_URL: url, ORIGIN: `http://localhost:${PORT}` }
	});
	child.on('exit', (code) => process.exit(code ?? 0));
}

switch (process.argv[2]) {
	case 'reset':
		await recreateDatabase(url);
		migrateDatabase(url);
		await seed();
		break;
	case 'seed':
		await seed();
		break;
	case 'dev':
		dev();
		break;
	default:
		console.error('Usage: bun scripts/sandbox.ts reset | seed | dev');
		process.exit(1);
}
