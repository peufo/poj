import { error, fail } from '@sveltejs/kit';
import { ORIGIN } from '$app/env/private';
import { authErrorMessages } from '#lib/server/auth-errors.js';
import { ConflictError } from '#lib/server/domain/index.js';
import { requireAdmin } from '#lib/server/web/guards.js';
import { text } from '#lib/server/web/form-data.js';
import { invitationSchema, revokeInvitationSchema } from '#lib/server/web/schemas/accounts.js';
import { accounts, invitations } from '#lib/server/web/services.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const [users, pending] = await Promise.all([accounts.list(), invitations.listPending()]);
	return { users, pending };
};

export const actions: Actions = {
	/** Génère un lien d'invitation, affiché une seule fois. */
	invite: async (event) => {
		const { request } = event;
		const adminId = requireAdmin(event);
		const email = text(await request.formData(), 'email');
		const parsed = invitationSchema.safeParse({ email });
		if (!parsed.success) return fail(400, { email, message: parsed.error.issues[0].message });

		try {
			const { invitation, token } = await invitations.create(adminId, parsed.data.email);
			return {
				invited: {
					email: invitation.email,
					link: `${ORIGIN}/invite/${token}`,
					expiresAt: invitation.expiresAt
				}
			};
		} catch (cause) {
			if (cause instanceof ConflictError) {
				return fail(409, { email, message: authErrorMessages.USER_ALREADY_EXISTS });
			}
			throw cause;
		}
	},

	revoke: async (event) => {
		const { request } = event;
		requireAdmin(event);
		const parsed = revokeInvitationSchema.safeParse({ id: text(await request.formData(), 'id') });
		if (!parsed.success) error(404, 'Invitation introuvable');
		await invitations.revoke(parsed.data.id);
		return { revoked: true };
	}
};
