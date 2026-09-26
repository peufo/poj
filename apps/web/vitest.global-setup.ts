import 'dotenv/config';
import { execSync } from 'node:child_process';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
	export interface ProvidedContext {
		databaseUrl: string;
	}
}

/** Applique les migrations Prisma sur la base de test avant la suite `server`. */
export default function setup(project: TestProject) {
	const databaseUrl = process.env.DATABASE_URL_TEST;
	if (!databaseUrl) throw new Error('DATABASE_URL_TEST is not set (see .env.example)');

	execSync('bunx prisma migrate deploy', {
		stdio: 'inherit',
		env: { ...process.env, DATABASE_URL: databaseUrl }
	});

	project.provide('databaseUrl', databaseUrl);
}
