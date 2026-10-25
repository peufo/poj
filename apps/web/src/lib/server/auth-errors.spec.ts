import { APIError } from 'better-auth/api';
import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './auth-errors';
import { createTestAuth } from './testing/auth';
import { useTestDatabase } from './testing/db';

const db = useTestDatabase();
const auth = createTestAuth(db);

const fallback = 'Connexion impossible.';
const signUp = (email: string, password = 'motdepasse123') =>
	auth.api.signUpEmail({ body: { name: 'Jonas', email, password } });

/** Message affiché pour l'erreur que lève `run`. */
async function messageOf(run: () => Promise<unknown>): Promise<string> {
	try {
		await run();
	} catch (error) {
		return authErrorMessage(error, fallback);
	}
	throw new Error('expected an error');
}

describe('auth error messages', () => {
	it('translates Better Auth errors by code', async () => {
		await signUp('jonas@test.dev');

		expect(
			await messageOf(() =>
				auth.api.signInEmail({ body: { email: 'jonas@test.dev', password: 'mauvais-mot' } })
			)
		).toBe('Email ou mot de passe incorrect.');
		expect(
			await messageOf(() =>
				auth.api.signInEmail({ body: { email: 'inconnu@test.dev', password: 'motdepasse123' } })
			)
		).toBe('Email ou mot de passe incorrect.');
		expect(await messageOf(() => signUp('intrus@test.dev'))).toBe(
			'Les inscriptions sont fermées : le compte existe déjà.'
		);
	});

	it('translates a too short password on sign-up', async () => {
		expect(await messageOf(() => signUp('jonas@test.dev', 'court'))).toBe(
			'Mot de passe trop court : 8 caractères au moins.'
		);
	});

	it('falls back to a generic message for unknown errors', () => {
		expect(authErrorMessage(new APIError('BAD_REQUEST', { message: 'Weird' }), fallback)).toBe(
			fallback
		);
		expect(authErrorMessage(new Error('boom'), fallback)).toBe(fallback);
		expect(authErrorMessage(new APIError('TOO_MANY_REQUESTS'), fallback)).toMatch(/^Trop de/);
	});
});
