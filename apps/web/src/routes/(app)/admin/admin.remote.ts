import { ORIGIN } from '$app/env/private';
import { form, getRequestEvent } from '$app/server';
import { authErrorMessages } from '#lib/server/auth-errors.js';
import { requireAdmin } from '#lib/server/web/guards.js';
import { invitationSchema, revokeInvitationSchema } from '#lib/server/web/schemas/accounts.js';
import { invitations, orInvalid } from '#lib/server/web/services.js';

/** Génère un lien d'invitation, affiché une seule fois. */
export const invite = form(invitationSchema, async ({ email }, issue) => {
	const adminId = requireAdmin(getRequestEvent());
	const { invitation, token } = await orInvalid(
		invitations.create(adminId, email),
		issue.email(authErrorMessages.USER_ALREADY_EXISTS)
	);
	return {
		email: invitation.email,
		link: `${ORIGIN}/invite/${token}`,
		expiresAt: invitation.expiresAt
	};
});

/** Révoque une invitation en attente (`revoke.for(id)`). */
export const revoke = form(revokeInvitationSchema, async ({ id }) => {
	requireAdmin(getRequestEvent());
	await invitations.revoke(id);
});
