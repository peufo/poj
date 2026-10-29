import { userOf } from '#lib/server/web/guards.js';
import { decks, deckSummary, reviews } from '#lib/server/web/services.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	// La page demandée suit jusqu'à la connexion. `untrack` : le layout ne se recharge pas
	// à chaque changement d'URL (recherche au fil de la frappe).
	const user = event.untrack(() => userOf(event));
	// Navigation : révisions à présenter maintenant (tous les decks), et chaque deck avec
	// son nombre de cartes. Les pages y prennent aussi le deck de `?deck=`.
	const [dueCount, owned] = await Promise.all([
		reviews.countDue(user.id, new Date()),
		decks.list(user.id)
	]);
	return {
		user: {
			id: user.id,
			name: user.name,
			email: user.email,
			isAdmin: user.role === 'admin'
		},
		nav: { dueCount, decks: owned.map(deckSummary) }
	};
};
