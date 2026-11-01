import { error, redirect } from '@sveltejs/kit';
import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';
import { auth } from '#lib/server/auth.js';
import { describeScopes, oauthQuery } from '#lib/server/oauth-flow.js';
import type { PageServerLoad } from './$types';

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
