import { MAX_NEW_CARDS_PER_DAY, MIN_NEW_CARDS_PER_DAY } from '#lib/server/domain/index.js';
import { deckFormValues } from '#lib/server/web/deck-form.js';
import { ownerOf } from '#lib/server/web/guards.js';
import { decks, idOf, orNotFound } from '#lib/server/web/services.js';
import type { PageServerLoad } from './$types';

// Modification d'un deck : nom, option des deux sens, nouvelles cartes par jour et, pour un
// sujet, noms des faces. Suppression du deck et de ses cartes.

export const load: PageServerLoad = async (event) => {
	const ownerId = ownerOf(event);
	const id = idOf(event.params.id, 'Deck');
	const [deck, perDay] = await Promise.all([
		orNotFound(decks.get(ownerId, id), 'Deck'),
		orNotFound(decks.newCardsPerDay(ownerId, id), 'Deck')
	]);
	return {
		deck: { id: deck.id, name: deck.name },
		values: deckFormValues(deck),
		newCards: { perDay, min: MIN_NEW_CARDS_PER_DAY, max: MAX_NEW_CARDS_PER_DAY }
	};
};
