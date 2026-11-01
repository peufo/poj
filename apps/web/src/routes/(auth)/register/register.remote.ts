import { invalid, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { form, getRequestEvent } from '$app/server';
import { auth } from '#lib/server/auth.js';
import { authErrorMessage } from '#lib/server/auth-errors.js';
import { registerSchema } from '#lib/server/web/schemas/accounts.js';

/** Premier compte (administrateur) ; Better Auth refuse les suivants. */
export const register = form(registerSchema, async (account) => {
	try {
		await auth.api.signUpEmail({ body: account, headers: getRequestEvent().request.headers });
	} catch (error) {
		invalid(
			error instanceof APIError
				? authErrorMessage(error, 'Inscription impossible.')
				: 'Erreur inattendue. Réessaie.'
		);
	}
	redirect(303, '/cards');
});
