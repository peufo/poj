import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '#lib/server/auth.js';
import type { Actions } from './$types';

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
				return fail(400, { name, email, message: error.message || 'Inscription impossible' });
			}
			return fail(500, { name, email, message: 'Erreur inattendue' });
		}

		redirect(302, '/cards');
	}
};
