import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '#lib/server/auth.js';
import { authErrorMessage } from '#lib/server/auth-errors.js';
import { PASSWORD_MIN_LENGTH } from '#lib/server/domain/index.js';
import { accounts } from '#lib/server/web/services.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Le premier compte existe déjà : l'inscription est fermée (refusée aussi côté Better Auth).
	if (!(await accounts.isSignUpOpen())) redirect(302, '/login');
	return { minPasswordLength: PASSWORD_MIN_LENGTH };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const name = form.get('name')?.toString() ?? '';
		const email = form.get('email')?.toString() ?? '';
		const password = form.get('password')?.toString() ?? '';

		try {
			await auth.api.signUpEmail({ body: { name, email, password }, headers: request.headers });
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, {
					name,
					email,
					message: authErrorMessage(error, 'Inscription impossible.')
				});
			}
			return fail(500, { name, email, message: 'Erreur inattendue. Réessaie.' });
		}

		redirect(302, '/cards');
	}
};
