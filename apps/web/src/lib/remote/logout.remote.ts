import { redirect } from '@sveltejs/kit';
import { form, getRequestEvent } from '$app/server';
import { auth } from '#lib/server/auth.js';

/**
 * Déconnexion, depuis la barre latérale (`AppShell`) ou la feuille du compte
 * (`AccountMenu`) : chacune a son instance (`logout.for(…)`).
 */
export const logout = form(async () => {
	await auth.api.signOut({ headers: getRequestEvent().request.headers });
	redirect(303, '/login');
});
