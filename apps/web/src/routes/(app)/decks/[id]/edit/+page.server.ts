import { deckFormValues } from '#lib/server/web/deck-form.js';
import { ownerOf } from '#lib/server/web/guards.js';
import { decks, idOf, orNotFound } from '#lib/server/web/services.js';
import type { PageServerLoad } from './$types';

// Modification d'un deck : nom, option des deux sens et, pour un sujet, noms des faces.
// Suppression du deck et de ses cartes.

export const load: PageServerLoad = async (event) => {
	const deck = await orNotFound(decks.get(ownerOf(event), idOf(event.params.id, 'Deck')), 'Deck');
	return { deck: { id: deck.id, name: deck.name }, values: deckFormValues(deck) };
};
