import { fail } from '@sveltejs/kit';
import { ORIGIN } from '$app/env/private';
import { ConflictError } from '#lib/server/domain/index.js';
import { requireAdmin } from '#lib/server/web/admin.js';
import { accounts, idOf, invitations } from '#lib/server/web/services.js';
import type { Actions, PageServerLoad } from './$types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const [users, pending] = await Promise.all([accounts.list(), invitations.listPending()]);
	return { users, pending };
};

export const actions: Actions = {
	/** Génère un lien d'invitation, affiché une seule fois. */
	invite: async ({ locals, request }) => {
		const adminId = requireAdmin(locals);
		const email = (await request.formData()).get('email')?.toString().trim() ?? '';
		if (!EMAIL.test(email)) return fail(400, { email, message: 'Adresse email invalide.' });

		try {
			const { invitation, token } = await invitations.create(adminId, email);
			return {
				invited: {
					email: invitation.email,
					link: `${ORIGIN}/invite/${token}`,
					expiresAt: invitation.expiresAt
				}
			};
		} catch (error) {
			if (error instanceof ConflictError) {
				return fail(409, { email, message: 'Un compte existe déjà avec cet email.' });
			}
			throw error;
		}
	},

	revoke: async ({ locals, request }) => {
		requireAdmin(locals);
		await invitations.revoke(idOf((await request.formData()).get('id'), 'Invitation'));
		return { revoked: true };
	}
};
