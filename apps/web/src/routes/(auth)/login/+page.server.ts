import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { createAccountsService } from '#lib/server/domain/index.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Premier lancement : aucun compte, on propose de le créer.
	if (await createAccountsService(db).isSignUpOpen()) redirect(302, '/register');
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const email = form.get('email')?.toString() ?? '';
		const password = form.get('password')?.toString() ?? '';

		try {
			await auth.api.signInEmail({ body: { email, password }, headers: request.headers });
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { email, message: error.message || 'Connexion impossible' });
			}
			return fail(500, { email, message: 'Erreur inattendue' });
		}

		redirect(302, '/cards');
	}
};
