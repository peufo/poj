import { describe, expect, it } from 'vitest';
import { createAccountsService } from './domain/index.js';
import { createTestAuth } from './testing/auth';
import { useTestDatabase } from './testing/db';

const db = useTestDatabase();
const auth = createTestAuth(db);

const signUp = (email: string) =>
	auth.api.signUpEmail({ body: { name: 'Jonas', email, password: 'motdepasse123' } });

describe('single account', () => {
	it('opens sign-up only while no account exists', async () => {
		const accounts = createAccountsService(db);
		expect(await accounts.isSignUpOpen()).toBe(true);

		await signUp('jonas@test.dev');

		expect(await accounts.isSignUpOpen()).toBe(false);
	});

	it('refuses a second sign-up through the Better Auth endpoint', async () => {
		await signUp('jonas@test.dev');

		await expect(signUp('intrus@test.dev')).rejects.toMatchObject({ status: 'FORBIDDEN' });
		expect(await db.user.count()).toBe(1);
	});
});
