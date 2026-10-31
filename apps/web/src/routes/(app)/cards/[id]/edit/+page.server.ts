import { cards, deckView, idOf, orNotFound } from '#lib/server/web/services.js';
import { ownerOf } from '#lib/server/web/guards.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { params } = event;
	const card = await orNotFound(cards.get(ownerOf(event), idOf(params.id)));
	return {
		card: { id: card.id, sideA: card.sideA, sideB: card.sideB, context: card.context },
		deck: deckView(card.deck)
	};
};
