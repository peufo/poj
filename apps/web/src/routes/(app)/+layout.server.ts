import { userOf } from '#lib/server/web/guards.js';
import { cards, reviews } from '#lib/server/web/services.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	// La page demandée suit jusqu'à la connexion. `untrack` : le layout ne se recharge pas
	// à chaque changement d'URL (recherche au fil de la frappe).
	const user = event.untrack(() => userOf(event));
	const now = new Date();
	// Compteurs de la navigation : révisions à présenter maintenant, cartes du paquet.
	const [dueCount, { totalCards }] = await Promise.all([
		reviews.countDue(user.id, now),
		cards.stats(user.id, now)
	]);
	return {
		user: {
			id: user.id,
			name: user.name,
			email: user.email,
			isAdmin: user.role === 'admin'
		},
		nav: { dueCount, cardCount: totalCards }
	};
};
