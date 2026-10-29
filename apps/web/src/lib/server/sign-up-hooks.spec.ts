import { describe, expect, it } from 'vitest';
import { createAccountsService } from './domain/index.js';
import { createTestAuth, TEST_ORIGIN } from './testing/auth';
import { useTestDatabase } from './testing/db';

const db = useTestDatabase();
const auth = createTestAuth(db);

const password = 'motdepasse123';
const signUp = (email: string, extra: Record<string, unknown> = {}) =>
	auth.api.signUpEmail({ body: { name: 'Jonas', email, password, ...extra } });

/** Appel HTTP direct à un endpoint Better Auth, comme le ferait un client quelconque. */
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
	auth.handler(
		new Request(`${TEST_ORIGIN}/api/auth${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: TEST_ORIGIN, ...headers },
			body: JSON.stringify(body)
		})
	);

describe('sign-up hooks', () => {
	it('opens sign-up only while no account exists', async () => {
		const accounts = createAccountsService(db);
		expect(await accounts.isSignUpOpen()).toBe(true);

		await signUp('jonas@test.dev');

		expect(await accounts.isSignUpOpen()).toBe(false);
	});

	it('makes the first account an administrator', async () => {
		const { user } = await signUp('jonas@test.dev');

		expect(user.role).toBe('admin');
		expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
			role: 'admin'
		});
	});

	it('refuses a second sign-up through the Better Auth API', async () => {
		await signUp('jonas@test.dev');

		await expect(signUp('intrus@test.dev')).rejects.toMatchObject({ status: 'FORBIDDEN' });
		expect(await db.user.count()).toBe(1);
	});

	it('refuses a second sign-up through the HTTP endpoint, even claiming a role', async () => {
		await signUp('jonas@test.dev');

		const response = await post('/sign-up/email', {
			name: 'Intrus',
			email: 'intrus@test.dev',
			password,
			role: 'admin'
		});

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: 'SIGN_UP_CLOSED' });
		expect(await db.user.count()).toBe(1);
	});

	it('does not let a user change their own role', async () => {
		await signUp('jonas@test.dev');
		const tester = await db.user.create({
			data: { name: 'Léa', email: 'lea@test.dev', role: 'user' }
		});
		const session = await db.session.create({
			data: { userId: tester.id, token: 'lea-session', expiresAt: new Date(Date.now() + 3600e3) }
		});

		const response = await post(
			'/update-user',
			{ role: 'admin' },
			{ authorization: `Bearer ${session.token}` }
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ code: 'FIELD_NOT_ALLOWED' });
		expect(await db.user.findUniqueOrThrow({ where: { id: tester.id } })).toMatchObject({
			role: 'user'
		});
	});
});
