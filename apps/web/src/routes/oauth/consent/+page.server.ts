import { error, fail, redirect } from '@sveltejs/kit';
import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';
import { APIError } from 'better-auth/api';
import { auth } from '#lib/server/auth.js';
import {
	describeScopes,
	oauthApiContext,
	oauthQuery,
	oauthRedirect
} from '#lib/server/oauth-flow.js';
import { text } from '#lib/server/web/form-data.js';
import { consentSchema } from '#lib/server/web/schemas/oauth.js';
import type { Actions, PageServerLoad } from './$types';

// Page de consentement du serveur d'autorisation OAuth (`consentPage` de `mcp()`), hors
// du groupe (auth) : elle exige d'être connecté.
export const load: PageServerLoad = async ({ locals, url, request }) => {
	const query = oauthQuery(url);
	const { secret } = await auth.$context;
	if (!query || !(await verifyOAuthQueryParams(query, secret))) {
		error(400, "Demande d'autorisation invalide ou expirée.");
	}
	if (!locals.user) redirect(302, `/login?${query}`);

	const params = new URLSearchParams(query);
	const client = await auth.api
		.getOAuthClientPublic({
			query: { client_id: params.get('client_id') ?? '' },
			headers: request.headers
		})
		.catch(() => null);
	if (!client) error(400, 'Application inconnue.');

	const redirectUri = URL.parse(params.get('redirect_uri') ?? '');
	return {
		query,
		client: { name: client.client_name || 'Application sans nom', uri: client.client_uri },
		// La spec MCP demande d'afficher l'hôte où le code sera renvoyé.
		redirectHost: redirectUri?.host ?? '',
		scopes: describeScopes(params.get('scope'))
	};
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const parsed = consentSchema.safeParse({
			oauth_query: text(form, 'oauth_query'),
			accept: form.get('accept')?.toString()
		});
		if (!parsed.success) return fail(400, { message: parsed.error.issues[0].message });

		let result: unknown;
		try {
			result = await auth.api.oauth2Consent({
				body: parsed.data,
				...oauthApiContext(request)
			});
		} catch (e) {
			if (e instanceof APIError)
				return fail(400, { message: e.message || 'Autorisation impossible' });
			throw e;
		}

		const next = oauthRedirect(result);
		if (!next) return fail(500, { message: 'Réponse inattendue du serveur d’autorisation' });
		// `redirect_uri` du client (externe), validé par le plugin contre ceux enregistrés.
		redirect(302, next, { external: true });
	}
};
