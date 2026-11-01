import { invalid, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { form, getRequestEvent } from '$app/server';
import { auth } from '#lib/server/auth.js';
import { authErrorMessage } from '#lib/server/auth-errors.js';
import { oauthApiContext, oauthQuery, oauthRedirect } from '#lib/server/oauth-flow.js';
import { REDIRECT_PARAM, safeRedirectTo } from '#lib/server/web/redirect-to.js';
import { loginSchema } from '#lib/server/web/schemas/accounts.js';

/**
 * Connexion. Demandée par une autorisation OAuth (connecteur Claude), l'URL de la page
 * (`event.url`, transmise par le client) porte la requête signée, renvoyée au plugin.
 */
export const login = form(loginSchema, async (credentials) => {
	const { request, url } = getRequestEvent();
	const oauth_query = oauthQuery(url);

	let result: unknown;
	try {
		result = await auth.api.signInEmail({
			body: { ...credentials, ...(oauth_query && { oauth_query }) },
			...oauthApiContext(request)
		});
	} catch (error) {
		invalid(
			error instanceof APIError
				? authErrorMessage(error, 'Connexion impossible.')
				: 'Erreur inattendue. Réessaie.'
		);
	}

	// Flux OAuth : consentement, ou directement le `redirect_uri` (externe) du client,
	// validé par le plugin contre ceux enregistrés.
	const next = oauthRedirect(result);
	if (next) redirect(303, next, { external: true });
	// Hors flux OAuth : retour à la page demandée, si c'est un chemin interne.
	redirect(303, (!oauth_query && safeRedirectTo(url.searchParams.get(REDIRECT_PARAM))) || '/cards');
});
