import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '#lib/server/auth.js';
import { authErrorMessage } from '#lib/server/auth-errors.js';
import { db } from '#lib/server/db/index.js';
import { createAccountsService } from '#lib/server/domain/index.js';
import { oauthApiContext, oauthQuery, oauthRedirect } from '#lib/server/oauth-flow.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Premier lancement : aucun compte, on propose de le créer.
	if (await createAccountsService(db).isSignUpOpen()) redirect(302, '/register');
};

export const actions: Actions = {
	default: async ({ request, url }) => {
		const form = await request.formData();
		const email = form.get('email')?.toString() ?? '';
		const password = form.get('password')?.toString() ?? '';
		// Connexion demandée par une autorisation OAuth (connecteur Claude) : le formulaire
		// est posté sur l'URL de la page, qui porte la requête signée.
		const oauth_query = oauthQuery(url);

		let result: unknown;
		try {
			result = await auth.api.signInEmail({
				body: { email, password, ...(oauth_query && { oauth_query }) },
				...oauthApiContext(request)
			});
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { email, message: authErrorMessage(error, 'Connexion impossible.') });
			}
			return fail(500, { email, message: 'Erreur inattendue. Réessaie.' });
		}

		// Flux OAuth : consentement, ou directement le `redirect_uri` (externe) du client,
		// validé par le plugin contre ceux enregistrés.
		const next = oauthRedirect(result);
		if (next) redirect(302, next, { external: true });
		redirect(302, '/cards');
	}
};
