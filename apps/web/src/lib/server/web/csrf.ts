import type { Handle } from '@sveltejs/kit/hooks';

/**
 * Endpoints OAuth qu'un client appelle de serveur à serveur (RFC 6749, 7009, 7662), en
 * `application/x-www-form-urlencoded` et sans en-tête `Origin` de navigateur. Ils ne
 * s'authentifient pas par cookie : la protection CSRF n'a pas lieu d'être, et elle bloquait
 * l'échange du code de Claude (403 avant même Better Auth).
 */
const SERVER_TO_SERVER_PATHS = new Set([
	'/api/auth/oauth2/token',
	'/api/auth/oauth2/revoke',
	'/api/auth/oauth2/introspect'
]);

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Types qu'un formulaire HTML peut envoyer d'un autre site sans requête préalable (CORS).
const FORM_CONTENT_TYPES = new Set([
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain'
]);

function isFormContentType(request: Request): boolean {
	const header = request.headers.get('content-type');
	if (!header) return true;
	return FORM_CONTENT_TYPES.has(header.split(';', 1)[0].trim().toLowerCase());
}

/**
 * La règle de SvelteKit (`csrf.trustedOrigins`), reprise ici parce que celle du kit ne connaît
 * pas d'exception par chemin : un envoi de formulaire (`POST`, `PUT`, `PATCH`, `DELETE`) doit
 * venir de l'app elle-même, sauf vers les endpoints OAuth de serveur à serveur.
 *
 * Le kit est réglé sur `trustedOrigins: ['*']` (`vite.config.ts`) pour céder la main à ce hook.
 * Les remote functions gardent leur propre vérification, que ce réglage ne désactive pas.
 */
export function isCrossSiteFormSubmission(request: Request, url: URL): boolean {
	return (
		MUTATING_METHODS.has(request.method) &&
		isFormContentType(request) &&
		request.headers.get('origin') !== url.origin &&
		!SERVER_TO_SERVER_PATHS.has(url.pathname)
	);
}

export const handleCsrf: Handle = ({ event, resolve }) => {
	if (isCrossSiteFormSubmission(event.request, event.url)) {
		const message = `Cross-site ${event.request.method} form submissions are forbidden`;
		return event.request.headers.get('accept') === 'application/json'
			? Response.json({ message }, { status: 403 })
			: new Response(message, { status: 403 });
	}
	return resolve(event);
};
