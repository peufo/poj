import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { loginUrl } from '#lib/server/web/redirect-to.js';

// Gardes des pages web, sans accès à la base : testables sous node avec un faux event.

/** Ce que les gardes lisent de la requête (`load` ou form action). */
export type GuardEvent = Pick<RequestEvent, 'locals' | 'url'>;

/**
 * Utilisateur de la requête ; sans session, retour à la connexion, qui ramènera à la page
 * demandée. `url` n'est lue que dans ce cas : un `load` connecté ne dépend pas de l'URL.
 */
export function userOf({ locals, url }: GuardEvent): NonNullable<App.Locals['user']> {
	if (!locals.user) redirect(303, loginUrl(url));
	return locals.user;
}

/**
 * Propriétaire de la requête. Les `load` sont protégés par le layout `(app)`, mais pas
 * les form actions : chacune passe par ici.
 */
export function ownerOf(event: GuardEvent): string {
	return userOf(event).id;
}

/**
 * Garde de l'administration : à appeler dans le `load` et dans chaque form action de
 * `/admin`. Sans session, retour à la connexion ; sans le rôle `admin`, 403. Renvoie l'id
 * de l'administrateur.
 */
export function requireAdmin(event: GuardEvent): string {
	const user = userOf(event);
	if (user.role !== 'admin') error(403, 'Page réservée à l’administrateur');
	return user.id;
}
