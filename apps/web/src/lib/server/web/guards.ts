import { error, redirect } from '@sveltejs/kit';

// Gardes des pages web, sans accès à la base : testables sous node.

/** Utilisateur de la requête ; sans session, retour à la connexion. */
function userOf(locals: App.Locals): NonNullable<App.Locals['user']> {
	if (!locals.user) redirect(303, '/login');
	return locals.user;
}

/**
 * Propriétaire de la requête. Les `load` sont protégés par le layout `(app)`, mais pas
 * les form actions : chacune passe par ici.
 */
export function ownerOf(locals: App.Locals): string {
	return userOf(locals).id;
}

/**
 * Garde de l'administration : à appeler dans le `load` et dans chaque form action de
 * `/admin`. Sans session, retour à la connexion ; sans le rôle `admin`, 403. Renvoie l'id
 * de l'administrateur.
 */
export function requireAdmin(locals: App.Locals): string {
	const user = userOf(locals);
	if (user.role !== 'admin') error(403, 'Page réservée à l’administrateur');
	return user.id;
}
