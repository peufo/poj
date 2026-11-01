import { redirect } from '@sveltejs/kit';
import { PASSWORD_MIN_LENGTH } from '#lib/server/domain/index.js';
import { accounts } from '#lib/server/web/services.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Le premier compte existe déjà : l'inscription est fermée (refusée aussi côté Better Auth).
	if (!(await accounts.isSignUpOpen())) redirect(302, '/login');
	return { minPasswordLength: PASSWORD_MIN_LENGTH };
};
