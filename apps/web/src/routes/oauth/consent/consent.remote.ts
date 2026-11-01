import { invalid, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { form, getRequestEvent } from '$app/server';
import { auth } from '#lib/server/auth.js';
import { oauthApiContext, oauthRedirect } from '#lib/server/oauth-flow.js';
import { consentSchema } from '#lib/server/web/schemas/oauth.js';

/** Accord ou refus de l'utilisateur, renvoyé au plugin avec la requête signée. */
export const consent = form(consentSchema, async (answer) => {
	let result: unknown;
	try {
		result = await auth.api.oauth2Consent({
			body: answer,
			...oauthApiContext(getRequestEvent().request)
		});
	} catch (error) {
		if (error instanceof APIError) invalid(error.message || 'Autorisation impossible');
		throw error;
	}

	const next = oauthRedirect(result);
	if (!next) invalid('Réponse inattendue du serveur d’autorisation');
	// `redirect_uri` du client (externe), validé par le plugin contre ceux enregistrés.
	redirect(303, next, { external: true });
});
