import { presentations } from '#lib/server/domain/index.js';
import { beltPosition } from '#lib/format/belt.js';
import { masteryOf } from '#lib/format/mastery.js';
import {
	cards,
	deckParam,
	decks,
	deckSummary,
	deckView,
	reviews
} from '#lib/server/web/services.js';
import { deckInScope, ownerOf } from '#lib/server/web/guards.js';
import { cardsSearchSchema } from '#lib/server/web/schemas/cards.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { url } = event;
	const ownerId = ownerOf(event);
	const { q: query } = cardsSearchSchema.parse(Object.fromEntries(url.searchParams));
	const now = new Date();
	// Le deck de `?deck=` : liste, recherche, tapis et révision ne portent que sur lui ; sans
	// lui, sur tous (le seul deck s'il n'y en a qu'un). Les vélocités restent globales.
	const scope = { deckId: deckParam(url) };

	const [owned, all, belt, velocities] = await Promise.all([
		decks.list(ownerId),
		cards.list(ownerId, scope),
		cards.belt(ownerId, now, scope),
		reviews.velocities(ownerId, now)
	]);
	const { deck } = deckInScope(url, owned.map(deckSummary));
	const listed = query ? await cards.list(ownerId, { ...scope, query }) : all;
	// Quand chaque sens sera présenté (mise de côté du sens inverse comprise).
	const shown = presentations(
		listed.flatMap((card) => card.reviews),
		now
	);

	return {
		now,
		query,
		totalCards: all.length,
		belt: {
			...belt,
			tokens: belt.tokens.map((token) => ({
				id: token.cardId,
				dueAt: now.getTime() + token.delayMs,
				level: masteryOf(token)
			})),
			forecast: belt.forecast.map(({ delayMs, perDay }) => ({
				position: beltPosition(delayMs),
				perDay
			}))
		},
		velocities,
		/** Deck affiché, `null` pour tous les decks. */
		deck,
		cards: listed.map((card) => ({
			id: card.id,
			sideA: card.sideA,
			sideB: card.sideB,
			deck: deckView(card.deck),
			reviews: card.reviews.map((review) => {
				const { buriedUntil } = shown.get(review.id) ?? { buriedUntil: null };
				return {
					direction: review.direction,
					// Un sens mis de côté s'affiche à la fin de sa mise de côté.
					due: buriedUntil ?? review.due,
					isNew: review.state === 'new' && !buriedUntil
				};
			})
		}))
	};
};
