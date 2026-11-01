import { redirect } from '@sveltejs/kit';
import { accounts } from '#lib/server/web/services.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Premier lancement : aucun compte, on propose de le créer.
	if (await accounts.isSignUpOpen()) redirect(302, '/register');
};
