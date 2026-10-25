// Reprise du flux d'autorisation OAuth (`@better-auth/mcp`) depuis les pages web.
//
// Le plugin redirige vers `/login` ou `/oauth/consent` avec la requête d'autorisation
// signée (`…&exp=…&sig=…`). Renvoyée telle quelle dans le corps (`oauth_query`) de
// `signInEmail` ou `oauth2Consent`, elle permet au plugin de poursuivre : il répond alors
// `{ redirect: true, url }` (page de consentement, ou `redirect_uri` du client avec le code).

/** Vrai si l'URL porte une requête d'autorisation signée par le plugin. */
export function isOAuthFlow(url: URL): boolean {
	return url.searchParams.has('sig');
}

/** Requête signée à renvoyer au plugin (`oauth_query`), ou `undefined` hors flux OAuth. */
export function oauthQuery(url: URL): string | undefined {
	return isOAuthFlow(url) ? url.search.slice(1) : undefined;
}

/**
 * Contexte d'un appel `auth.api` côté serveur qui peut poursuivre le flux : le plugin
 * exige la requête d'origine (`request`), et l'en-tête `accept` lui fait renvoyer
 * `{ redirect, url }` plutôt que lever une redirection. Avec `request`, Better Auth
 * renverrait une `Response` : `asResponse: false` garde la valeur.
 */
export function oauthApiContext(request: Request) {
	const headers = new Headers(request.headers);
	headers.set('accept', 'application/json');
	return { headers, request, asResponse: false as const };
}

/** URL où poursuivre si le plugin a pris la main sur la réponse (`{ redirect, url }`). */
export function oauthRedirect(result: unknown): string | undefined {
	if (typeof result !== 'object' || result === null) return undefined;
	const { redirect, url } = result as { redirect?: unknown; url?: unknown };
	return redirect === true && typeof url === 'string' ? url : undefined;
}

const SCOPE_LABELS: Record<string, string> = {
	cards: 'Lire, créer et réviser vos cartes',
	openid: 'Connaître votre identifiant Poj',
	profile: 'Voir votre nom',
	email: 'Voir votre adresse email',
	offline_access: 'Rester connecté sans vous redemander votre accord'
};

/** Libellés des scopes demandés, dans l'ordre de la requête. */
export function describeScopes(scope: string | null): string[] {
	return (scope ?? '')
		.split(' ')
		.filter(Boolean)
		.map((s) => SCOPE_LABELS[s] ?? s);
}
