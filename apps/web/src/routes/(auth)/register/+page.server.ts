import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '#lib/server/auth.js';
import { authErrorMessage } from '#lib/server/auth-errors.js';
import { PASSWORD_MIN_LENGTH } from '#lib/server/domain/index.js';
import { text } from '#lib/server/web/form-data.js';
import { registerSchema } from '#lib/server/web/schemas/accounts.js';
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
		const name = text(form, 'name');
		const email = text(form, 'email');
		const parsed = registerSchema.safeParse({ name, email, password: text(form, 'password') });
		if (!parsed.success) {
			return fail(400, { name, email, message: parsed.error.issues[0].message });
		}

		try {
			await auth.api.signUpEmail({ body: parsed.data, headers: request.headers });
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
