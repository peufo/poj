import { betterAuth } from 'better-auth/minimal';
import { createAuthOptions } from '../auth-config';
import type { Db } from '../domain/index';

export const TEST_ORIGIN = 'http://localhost:5173';

/** Instance Better Auth avec la configuration de l'app, sans `sveltekitCookies` (auth.ts dépend de SvelteKit). */
export function createTestAuth(db: Db) {
	return betterAuth(
		createAuthOptions({ db, origin: TEST_ORIGIN, secret: 'test-secret-test-secret-test-secret' })
	);
}

export type TestAuth = ReturnType<typeof createTestAuth>;
