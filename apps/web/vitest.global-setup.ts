import 'dotenv/config';
import type { TestProject } from 'vitest/node';
import {
	assertDisposableDatabase,
	ensureDatabase,
	migrateDatabase,
	migrationsUpToDate
} from './src/lib/server/testing/database';

declare module 'vitest' {
	export interface ProvidedContext {
		databaseUrl: string;
	}
}

/** Crée la base de test si besoin et y applique les migrations en attente avant la suite `server`. */
export default async function setup(project: TestProject) {
	const databaseUrl = process.env.DATABASE_URL_TEST;
	if (!databaseUrl) throw new Error('DATABASE_URL_TEST is not set (see .env.example)');
	// Chaque test vide toutes les tables : jamais la base de dev.
	assertDisposableDatabase(databaseUrl, { devUrl: process.env.DATABASE_URL });

	const created = await ensureDatabase(databaseUrl);
	// `migrate deploy` coûte une demi-seconde : on ne le lance que s'il y a du nouveau.
	if (created || !(await migrationsUpToDate(databaseUrl))) migrateDatabase(databaseUrl);

	project.provide('databaseUrl', databaseUrl);
}
