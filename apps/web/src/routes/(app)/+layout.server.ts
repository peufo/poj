import { redirect } from '@sveltejs/kit';
import { cards, reviews } from '#lib/server/web/services.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');
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
