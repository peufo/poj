import { error, redirect } from '@sveltejs/kit';
import { loginUrl } from '#lib/server/web/redirect-to.js';

// Gardes des pages web, sans accès à la base : testables sous node.

/**
 * Utilisateur de la requête ; sans session, retour à la connexion, qui ramènera à la page
 * demandée. `url` n'est lue que dans ce cas : un `load` connecté ne dépend pas de l'URL.
 */
export function userOf(locals: App.Locals, url: URL): NonNullable<App.Locals['user']> {
	if (!locals.user) redirect(303, loginUrl(url.pathname + url.search));
	return locals.user;
}

/**
 * Propriétaire de la requête. Les `load` sont protégés par le layout `(app)`, mais pas
 * les form actions : chacune passe par ici.
 */
export function ownerOf(locals: App.Locals, url: URL): string {
	return userOf(locals, url).id;
}

/**
 * Garde de l'administration : à appeler dans le `load` et dans chaque form action de
 * `/admin`. Sans session, retour à la connexion ; sans le rôle `admin`, 403. Renvoie l'id
 * de l'administrateur.
 */
export function requireAdmin(locals: App.Locals, url: URL): string {
	const user = userOf(locals, url);
	if (user.role !== 'admin') error(403, 'Page réservée à l’administrateur');
	return user.id;
}
