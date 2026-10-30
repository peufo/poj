import { hashPassword } from 'better-auth/crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestAuth } from '../../testing/auth';
import { useTestDatabase } from '../../testing/db';
import { createUser } from '../../testing/factories';
import { ConflictError } from '../errors';
import { createAccountsService } from './accounts.service';
import {
	createInvitationsService,
	INVITATION_TTL_MS,
	InvitationUnavailableError
} from './invitations.service';

const db = useTestDatabase();
const invitations = createInvitationsService(db, hashPassword);

const now = new Date('2026-10-29T10:00:00Z');
const later = (ms: number) => new Date(now.getTime() + ms);
const tester = { name: 'Léa', password: 'motdepasse123' };

let admin: string;
beforeEach(async () => {
	admin = await createUser(db, 'Jonas', { role: 'admin' });
});

/** Raison du refus de `accept`, ou `accepted`. */
async function acceptOutcome(token: string, at = now) {
	try {
		await invitations.accept(token, tester, at);
		return 'accepted';
	} catch (error) {
		if (error instanceof InvitationUnavailableError) return error.reason;
		throw error;
	}
}

describe('invitations', () => {
	it('stores only a hash of the token and expires after seven days', async () => {
		const { invitation, token } = await invitations.create(admin, ' Lea@Test.dev ', now);

		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		const stored = await db.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
		expect(stored).toMatchObject({ email: 'lea@test.dev', invitedById: admin });
		expect(stored.tokenHash).not.toContain(token);
		expect(stored.expiresAt).toEqual(later(INVITATION_TTL_MS));
	});

	it('lists pending invitations only', async () => {
		const { invitation: kept } = await invitations.create(admin, 'lea@test.dev', now);
		const { invitation: revoked } = await invitations.create(admin, 'tom@test.dev', now);
		const { token } = await invitations.create(admin, 'zoe@test.dev', now);
		await invitations.revoke(revoked.id, now);
		await invitations.accept(token, tester, now);

		expect((await invitations.listPending(now)).map((i) => i.id)).toEqual([kept.id]);
		expect(await invitations.listPending(later(INVITATION_TTL_MS))).toEqual([]);
	});

	it('creates a tester account that can sign in with the chosen password', async () => {
		const { token } = await invitations.create(admin, 'lea@test.dev', now);
		expect(await invitations.inspect(token, now)).toEqual({
			status: 'valid',
			email: 'lea@test.dev'
		});

		const { userId } = await invitations.accept(token, { ...tester, name: ' Léa ' }, now);

		expect(await db.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({
			name: 'Léa',
			email: 'lea@test.dev',
			role: 'user'
		});
		const { user } = await createTestAuth(db).api.signInEmail({
			body: { email: 'lea@test.dev', password: tester.password }
		});
		expect(user.id).toBe(userId);
		expect(await createAccountsService(db).list()).toMatchObject([
			{ email: 'jonas@test.dev', role: 'admin' },
			{ email: 'lea@test.dev', role: 'user' }
		]);
	});

	it('is single use', async () => {
		const { token } = await invitations.create(admin, 'lea@test.dev', now);
		await invitations.accept(token, tester, now);

		expect(await invitations.inspect(token, now)).toEqual({ status: 'used' });
		expect(await acceptOutcome(token)).toBe('used');
		expect(await db.user.count()).toBe(2);
	});

	it('lets only one of two simultaneous uses through', async () => {
		const { token } = await invitations.create(admin, 'lea@test.dev', now);

		const outcomes = await Promise.all([acceptOutcome(token), acceptOutcome(token)]);

		expect(outcomes.sort()).toEqual(['accepted', 'used']);
		expect(await db.user.count({ where: { email: 'lea@test.dev' } })).toBe(1);
	});

	it('refuses an expired link', async () => {
		const { token } = await invitations.create(admin, 'lea@test.dev', now);
		const expired = later(INVITATION_TTL_MS);

		expect(await invitations.inspect(token, expired)).toEqual({ status: 'expired' });
		expect(await acceptOutcome(token, expired)).toBe('expired');
		expect(await acceptOutcome(token, later(INVITATION_TTL_MS - 1))).toBe('accepted');
	});

	it('refuses a revoked link, and revoking twice is harmless', async () => {
		const { invitation, token } = await invitations.create(admin, 'lea@test.dev', now);
		await invitations.revoke(invitation.id, now);
		await invitations.revoke(invitation.id, now);

		expect(await invitations.inspect(token, now)).toEqual({ status: 'revoked' });
		expect(await acceptOutcome(token)).toBe('revoked');
	});

	it('refuses an unknown or malformed link', async () => {
		const { token } = await invitations.create(admin, 'lea@test.dev', now);
		const unknown = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');

		for (const value of [unknown, 'abc', '']) {
			expect(await invitations.inspect(value, now)).toEqual({ status: 'invalid' });
			expect(await acceptOutcome(value)).toBe('invalid');
		}
	});

	it('revokes the previous link when a new one is generated for the same email', async () => {
		const first = await invitations.create(admin, 'lea@test.dev', now);
		const second = await invitations.create(admin, 'LEA@test.dev', now);

		expect(await acceptOutcome(first.token)).toBe('revoked');
		expect(await acceptOutcome(second.token)).toBe('accepted');
	});

	it('refuses to invite an email that already has an account', async () => {
		await expect(invitations.create(admin, 'Jonas@test.dev', now)).rejects.toBeInstanceOf(
			ConflictError
		);
	});

	it('keeps the link usable when the account cannot be created', async () => {
		const { token } = await invitations.create(admin, 'lea@test.dev', now);
		await createUser(db, 'Lea');

		await expect(invitations.accept(token, tester, now)).rejects.toBeInstanceOf(ConflictError);
		expect(await invitations.inspect(token, now)).toMatchObject({ status: 'valid' });
	});
});
