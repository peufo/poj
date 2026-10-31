import {
	calendarDaysBetween,
	MAX_DAILY_GOAL,
	MIN_DAILY_GOAL,
	presentations,
	weekdayIndex
} from '#lib/server/domain/index.js';
import { masteryOf, type MasteryLevel } from '#lib/format/mastery.js';
import {
	cards,
	dailyGoal,
	deckParam,
	decks,
	deckSummary,
	deckView,
	reviews
} from '#lib/server/web/services.js';
import { deckInScope, ownerOf } from '#lib/server/web/guards.js';
import { cardsSearchSchema } from '#lib/server/web/schemas/cards.js';
import type { PageServerLoad } from './$types';

const HORIZON_DAYS = 14;
/** Semaines du calendrier d'accomplissement, la dernière étant la semaine en cours. */
const GOAL_WEEKS = 8;

export const load: PageServerLoad = async (event) => {
	const { url } = event;
	const ownerId = ownerOf(event);
	const { q: query } = cardsSearchSchema.parse(Object.fromEntries(url.searchParams));
	const now = new Date();
	// Le deck de `?deck=` : liste, recherche, échéancier, maîtrise et révision ne portent que
	// sur lui ; sans lui, sur tous (le seul deck s'il n'y en a qu'un). L'objectif reste global.
	const scope = { deckId: deckParam(url) };

	const [owned, all, stats, horizon, dueNow, goal] = await Promise.all([
		decks.list(ownerId),
		cards.list(ownerId, scope),
		cards.stats(ownerId, now, scope),
		cards.horizon(ownerId, now, HORIZON_DAYS, scope),
		reviews.countDue(ownerId, now, scope),
		// Du lundi d'il y a sept semaines jusqu'à aujourd'hui.
		dailyGoal.progress(ownerId, now, (GOAL_WEEKS - 1) * 7 + weekdayIndex(now) + 1)
	]);
	const { deck } = deckInScope(url, owned.map(deckSummary));
	const listed = query ? await cards.list(ownerId, { ...scope, query }) : all;
	// Quand chaque sens sera présenté (mise de côté du sens inverse comprise).
	// La liste filtrée est incluse dans le paquet entier (au plus une entrée par carte).
	const byId = new Map([...all, ...listed].map((card) => [card.id, card]));
	const shown = presentations(
		[...byId.values()].flatMap((card) => card.reviews),
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
		goal,
		goalBounds: { min: MIN_DAILY_GOAL, max: MAX_DAILY_GOAL },
		mastery,
		/** Deck affiché, `null` pour tous les decks. */
		deck,
		cards: listed.map((card) => ({
			id: card.id,
			sideA: card.sideA,
			sideB: card.sideB,
			deck: deckView(card.deck),
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
