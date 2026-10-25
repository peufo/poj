import { betterAuth } from 'better-auth/minimal';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { Db } from '../domain/index';
import { singleAccountHooks } from '../single-account';

/** Instance Better Auth minimale, avec les mêmes hooks que l'app (auth.ts dépend de SvelteKit). */
export function createTestAuth(db: Db) {
	return betterAuth({
		baseURL: 'http://localhost:5173',
		secret: 'test-secret-test-secret-test-secret',
		database: prismaAdapter(db, { provider: 'postgresql' }),
		emailAndPassword: { enabled: true },
		advanced: { database: { generateId: 'uuid' } },
		databaseHooks: singleAccountHooks(db)
	});
}
