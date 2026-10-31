import { redirect } from '@sveltejs/kit';
import { form, getRequestEvent } from '$app/server';
import { findDuplicate, translateCard } from '#lib/server/web/card-form.js';
import { ownerOf } from '#lib/server/web/guards.js';
import { newCardFormSchema } from '#lib/server/web/schemas/cards.js';
import { cards, decks, orNotFound } from '#lib/server/web/services.js';

/**
 * Nouvelle carte, dans le deck choisi (404 s'il n'est pas au propriétaire) : suggestion
 * DeepL, ou enregistrement après l'éventuel avertissement de doublon. Retour au deck si
 * l'on en vient (`?deck=`), sinon à toutes les cartes.
 */
export const createCard = form(newCardFormSchema, async (input) => {
	const event = getRequestEvent();
	const ownerId = ownerOf(event);
	const deck = await orNotFound(decks.get(ownerId, input.deckId), 'Deck');
	if (input.intent === 'translate') return translateCard(deck, input);

	const duplicate = await findDuplicate(cards, ownerId, deck, input);
	if (duplicate) return { duplicate };

	await cards.create(ownerId, deck.id, input, 'web');
	redirect(303, event.url.searchParams.has('deck') ? `/cards?deck=${deck.id}` : '/cards');
});
