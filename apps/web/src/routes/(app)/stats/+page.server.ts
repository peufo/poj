import { activity, deckParam, decks, deckSummary, reviews } from '#lib/server/web/services.js';
import { deckInScope, ownerOf } from '#lib/server/web/guards.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { url } = event;
	const ownerId = ownerOf(event);
	const now = new Date();
	// Comme sur `/cards` : l'activité porte sur le deck de `?deck=` (ou sur tous), les
	// vélocités restent globales.
	const scope = { deckId: deckParam(url) };

	const [owned, velocities, days] = await Promise.all([
		decks.list(ownerId),
		reviews.velocities(ownerId, now),
		activity.daily(ownerId, now, scope)
	]);
	const { deck } = deckInScope(url, owned.map(deckSummary));

	return {
		velocities,
		/** Ajouts et réponses jour par jour, sur l'année écoulée. */
		activity: days,
		/** Deck affiché, `null` pour tous les decks. */
		deck: deck && { id: deck.id, name: deck.name }
	};
};
