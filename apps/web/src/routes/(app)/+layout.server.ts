import { userOf } from '#lib/server/web/guards.js';
import { dailyGoal, decks, deckSummary, reviews } from '#lib/server/web/services.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	// La page demandée suit jusqu'à la connexion. `untrack` : le layout ne se recharge pas
	// à chaque changement d'URL (recherche au fil de la frappe).
	const user = event.untrack(() => userOf(event));
	// Navigation : révisions à présenter maintenant (tous les decks), et chaque deck avec
	// son nombre de cartes. Les pages y prennent aussi le deck de `?deck=`. La journée Poj :
	// la célébrer sur n'importe quelle page dès qu'elle devient complète (le layout se
	// recharge après chaque formulaire).
	const now = new Date();
	const [dueCount, owned, today] = await Promise.all([
		reviews.countDue(user.id, now),
		decks.list(user.id),
		dailyGoal.today(user.id, now)
	]);
	return {
		user: {
			id: user.id,
			name: user.name,
			email: user.email,
			isAdmin: user.role === 'admin'
		},
		nav: { dueCount, decks: owned.map(deckSummary) },
		day: { date: today.date, full: today.level === 'full' }
	};
};
