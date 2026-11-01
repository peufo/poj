import { invalid, redirect } from '@sveltejs/kit';
import { form, getRequestEvent } from '$app/server';
import { auth } from '#lib/server/auth.js';
import { authErrorMessages, invitationUnavailableMessages } from '#lib/server/auth-errors.js';
import { ConflictError, InvitationUnavailableError } from '#lib/server/domain/index.js';
import { inviteSchema } from '#lib/server/web/schemas/accounts.js';
import { invitations } from '#lib/server/web/services.js';

/** Crée le compte d'un testeur invité, puis ouvre sa session comme à la connexion. */
export const acceptInvitation = form(inviteSchema, async (input) => {
	const { params, request } = getRequestEvent();
	let email: string;
	try {
		({ email } = await invitations.accept(params.token ?? '', input));
	} catch (error) {
		if (error instanceof InvitationUnavailableError) {
			invalid(invitationUnavailableMessages[error.reason]);
		}
		if (error instanceof ConflictError) invalid(authErrorMessages.USER_ALREADY_EXISTS);
		throw error;
	}

	try {
		await auth.api.signInEmail({
			body: { email, password: input.password },
			headers: request.headers
		});
	} catch {
		redirect(303, '/login');
	}
	redirect(303, '/cards');
});
