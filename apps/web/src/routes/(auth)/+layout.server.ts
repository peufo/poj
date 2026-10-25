import { redirect } from '@sveltejs/kit';
import { isOAuthFlow } from '#lib/server/oauth-flow.js';
import { REDIRECT_PARAM, safeRedirectTo } from '#lib/server/web/redirect-to.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
	// Au milieu d'une autorisation OAuth (`prompt=login`), la connexion est redemandée.
	if (locals.user && !isOAuthFlow(url)) {
		redirect(302, safeRedirectTo(url.searchParams.get(REDIRECT_PARAM)) ?? '/cards');
	}
};
