// Retour à la page demandée après la connexion (`/login?redirectTo=/cards/…`).

/** Paramètre qui porte la page demandée jusqu'à la connexion. */
export const REDIRECT_PARAM = 'redirectTo';

const BASE = 'http://poj.invalid';

/**
 * Chemin interne relatif où revenir, ou `null` : il doit commencer par une seule `/`
 * (ni `//`, ni `/\`, ni schéma) et rester sur le site une fois résolu, pour qu'aucun
 * lien ne puisse renvoyer ailleurs après la connexion (redirection ouverte).
 */
export function safeRedirectTo(value: string | null | undefined): string | null {
	if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
		return null;
	}
	let url: URL;
	try {
		url = new URL(value, BASE);
	} catch {
		return null;
	}
	if (url.origin !== BASE) return null;
	return url.pathname + url.search + url.hash;
}

/**
 * Page de connexion qui ramènera à `page` (sauf la page d'accueil par défaut), sans ses
 * paramètres de form action (`?/goal`) : on y revient par un GET.
 */
export function loginUrl({ pathname, searchParams }: URL): string {
	const query = new URLSearchParams([...searchParams].filter(([key]) => !key.startsWith('/')));
	const search = query.toString();
	const target = safeRedirectTo(search ? `${pathname}?${search}` : pathname);
	return target && target !== '/cards'
		? `/login?${REDIRECT_PARAM}=${encodeURIComponent(target)}`
		: '/login';
}
