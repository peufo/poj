import { describe, expect, it } from 'vitest';
import { authErrorMessages } from '#lib/server/auth-errors.js';
import {
	invitationSchema,
	inviteSchema,
	loginSchema,
	registerSchema,
	revokeInvitationSchema
} from './accounts';
import { consentSchema } from './oauth';

/** Messages des champs refusés, dans l'ordre. */
const messages = (result: { error?: { issues: { message: string }[] } }) =>
	result.error?.issues.map((issue) => issue.message);

describe('account forms', () => {
	it('requires a name and a password of 8 to 128 characters for a new account', () => {
		expect(messages(inviteSchema.safeParse({ name: '  ', password: 'motdepasse' }))).toEqual([
			'Indique ton nom.'
		]);
		expect(messages(inviteSchema.safeParse({ name: 'Léa', password: 'court' }))).toEqual([
			authErrorMessages.PASSWORD_TOO_SHORT
		]);
		expect(messages(inviteSchema.safeParse({ name: 'Léa', password: 'x'.repeat(129) }))).toEqual([
			authErrorMessages.PASSWORD_TOO_LONG
		]);
		expect(inviteSchema.parse({ name: ' Léa ', password: 'x'.repeat(128) })).toEqual({
			name: 'Léa',
			password: 'x'.repeat(128)
		});
	});

	it('checks the address of a new account, trimmed', () => {
		const input = { name: 'Léa', email: ' lea@test.dev ', password: 'motdepasse' };
		expect(registerSchema.parse(input)).toEqual({ ...input, email: 'lea@test.dev' });
		expect(messages(registerSchema.safeParse({ ...input, email: 'lea@' }))).toEqual([
			authErrorMessages.INVALID_EMAIL
		]);
		expect(messages(invitationSchema.safeParse({ email: '' }))).toEqual([
			authErrorMessages.INVALID_EMAIL
		]);
	});

	it('leaves the password of a sign-in to Better Auth, only requiring one', () => {
		expect(loginSchema.parse({ email: 'lea@test.dev', password: 'court' })).toEqual({
			email: 'lea@test.dev',
			password: 'court'
		});
		expect(messages(loginSchema.safeParse({ email: 'lea@test.dev', password: '' }))).toEqual([
			'Indique ton mot de passe.'
		]);
	});

	it('revokes an invitation by its id only', () => {
		expect(revokeInvitationSchema.safeParse({ id: 'abc' }).success).toBe(false);
		expect(
			revokeInvitationSchema.safeParse({ id: '0199a0a0-0000-7000-8000-000000000000' }).success
		).toBe(true);
	});
});

describe('consent form', () => {
	it('accepts only on the accept button, and requires the signed request', () => {
		expect(consentSchema.parse({ oauth_query: 'a=1&sig=x', accept: 'true' }).accept).toBe(true);
		expect(consentSchema.parse({ oauth_query: 'a=1&sig=x', accept: 'false' }).accept).toBe(false);
		expect(consentSchema.parse({ oauth_query: 'a=1&sig=x' }).accept).toBe(false);
		expect(messages(consentSchema.safeParse({ oauth_query: '' }))).toEqual([
			'Demande d’autorisation invalide ou expirée.'
		]);
	});
});
