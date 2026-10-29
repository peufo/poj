import { error, redirect } from '@sveltejs/kit';

/**
 * Garde de l'administration : à appeler dans le `load` et dans chaque form action de
 * `/admin`. Sans session, retour à la connexion ; sans le rôle `admin`, 403. Renvoie l'id
 * de l'administrateur.
 */
export function requireAdmin(locals: App.Locals): string {
	if (!locals.user) redirect(303, '/login');
	if (locals.user.role !== 'admin') error(403, 'Page réservée à l’administrateur');
	return locals.user.id;
}
