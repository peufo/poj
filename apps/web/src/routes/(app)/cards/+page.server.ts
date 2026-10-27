import { calendarDaysBetween, presentations } from '#lib/server/domain/index.js';
import { masteryOf, type MasteryLevel } from '#lib/format/mastery.js';
import { cards, ownerOf, reviews } from '#lib/server/web/services.js';
import type { PageServerLoad } from './$types';

const HORIZON_DAYS = 14;

export const load: PageServerLoad = async ({ locals, url }) => {
	const ownerId = ownerOf(locals);
	const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
	const now = new Date();

	const [all, stats, horizon, dueNow] = await Promise.all([
		cards.list(ownerId),
		cards.stats(ownerId, now),
		cards.horizon(ownerId, now, HORIZON_DAYS),
		reviews.countDue(ownerId, now)
	]);
	const listed = query ? await cards.list(ownerId, { query }) : all;
	// Quand chaque sens sera présenté (mise de côté du sens inverse comprise).
	// La liste filtrée est incluse dans le paquet entier (au plus une entrée par carte).
	const deck = new Map([...all, ...listed].map((card) => [card.id, card]));
	const shown = presentations(
		[...deck.values()].flatMap((card) => card.reviews),
		now
	);

	// Maîtrise de tout le paquet, recherche ou pas.
	const mastery: Record<MasteryLevel, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
	for (const review of all.flatMap((c) => c.reviews)) mastery[masteryOf(review)] += 1;

	return {
		now,
		query,
		stats: { totalCards: stats.totalCards, dueToday: stats.dueToday, dueNow },
		horizon,
		mastery,
		cards: listed.map((card) => ({
			id: card.id,
			french: card.french,
			english: card.english,
			reviews: card.reviews.map((review) => {
				const { buriedUntil, at } = shown.get(review.id) ?? { buriedUntil: null, at: review.due };
				return {
					direction: review.direction,
					// Un sens mis de côté s'affiche à la fin de sa mise de côté.
					due: buriedUntil ?? review.due,
					isNew: review.state === 'new' && !buriedUntil,
					/** Jour de l'échéancier où ce sens compte (0 : aujourd'hui, retard compris). */
					day: Math.max(0, calendarDaysBetween(now, at))
				};
			})
		}))
	};
};
