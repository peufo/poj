import { redirect } from '@sveltejs/kit';
import { loginUrl } from '#lib/server/web/redirect-to.js';
import { cards, reviews } from '#lib/server/web/services.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url, untrack }) => {
	// La page demandée suit jusqu'à la connexion. `untrack` : le layout ne se recharge pas
	// à chaque changement d'URL (recherche au fil de la frappe).
	if (!locals.user)
		redirect(
			302,
			untrack(() => loginUrl(url.pathname + url.search))
		);
	const now = new Date();
	// Compteurs de la navigation : révisions à présenter maintenant, cartes du paquet.
	const [dueCount, { totalCards }] = await Promise.all([
		reviews.countDue(locals.user.id, now),
		cards.stats(locals.user.id, now)
	]);
	return {
		user: { id: locals.user.id, name: locals.user.name, email: locals.user.email },
		nav: { dueCount, cardCount: totalCards }
	};
};
