import { fail } from '@sveltejs/kit';
import {
	calendarDaysBetween,
	MAX_DAILY_GOAL,
	MIN_DAILY_GOAL,
	presentations,
	weekdayIndex
} from '#lib/server/domain/index.js';
import { masteryOf, type MasteryLevel } from '#lib/format/mastery.js';
import { cards, dailyGoal, ownerOf, reviews } from '#lib/server/web/services.js';
import type { Actions, PageServerLoad } from './$types';

const HORIZON_DAYS = 14;
/** Semaines du calendrier d'accomplissement, la dernière étant la semaine en cours. */
const GOAL_WEEKS = 8;

export const load: PageServerLoad = async ({ locals, url }) => {
	const ownerId = ownerOf(locals);
	const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
	const now = new Date();

	const [all, stats, horizon, dueNow, goal] = await Promise.all([
		cards.list(ownerId),
		cards.stats(ownerId, now),
		cards.horizon(ownerId, now, HORIZON_DAYS),
		reviews.countDue(ownerId, now),
		// Du lundi d'il y a sept semaines jusqu'à aujourd'hui.
		dailyGoal.progress(ownerId, now, (GOAL_WEEKS - 1) * 7 + weekdayIndex(now) + 1)
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
		goal,
		goalBounds: { min: MIN_DAILY_GOAL, max: MAX_DAILY_GOAL },
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

export const actions: Actions = {
	goal: async ({ request, locals }) => {
		const ownerId = ownerOf(locals);
		const value = (await request.formData()).get('goal')?.toString().trim() ?? '';
		const goal = Number(value);
		if (!/^\d+$/.test(value) || goal < MIN_DAILY_GOAL || goal > MAX_DAILY_GOAL) {
			return fail(400, {
				goalError: `Entre ${MIN_DAILY_GOAL} et ${MAX_DAILY_GOAL} cartes par jour.`,
				goalValue: value
			});
		}
		await dailyGoal.setGoal(ownerId, goal);
		return { goalSaved: true };
	}
};
