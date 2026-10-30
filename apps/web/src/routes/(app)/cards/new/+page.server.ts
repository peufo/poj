import { fail, redirect } from '@sveltejs/kit';
import { duplicateWarning, readCardForm, translateCard } from '#lib/server/web/card-form.js';
import { newCardSchema, newCardTranslationSchema } from '#lib/server/web/schemas/cards.js';
import { cards, decks, orNotFound } from '#lib/server/web/services.js';
import { deckInScope, ownerOf } from '#lib/server/web/guards.js';
import type { Actions, PageServerLoad } from './$types';

// La carte va dans le deck choisi : celui de `?deck=`, le seul deck, ou un choix explicite
// dans la liste. Ses faces nomment les champs du formulaire.
export const load: PageServerLoad = async ({ url, parent }) => {
	const { deck, explicit } = deckInScope(url, (await parent()).nav.decks);
	// Retour vers le deck d'où l'on vient, sinon vers toutes les cartes.
	const from = explicit ? deck : null;
	return {
		selectedDeck: deck?.id ?? null,
		back: from ? { href: `/cards?deck=${from.id}`, label: from.name } : null
	};
};

/** Deck choisi dans le formulaire ; 404 s'il n'est pas au propriétaire. */
const chosenDeck = (ownerId: string, deckId: string) =>
	orNotFound(decks.get(ownerId, deckId), 'Deck');

/** Page où revenir après l'enregistrement : le deck si l'on en vient, sinon toutes les cartes. */
const cardsOf = (url: URL, deckId: string) =>
	url.searchParams.has('deck') ? `/cards?deck=${deckId}` : '/cards';

export const actions: Actions = {
	translate: async (event) => {
		const ownerId = ownerOf(event);
		const form = await event.request.formData();
		const { values, errors, input } = readCardForm(form, newCardTranslationSchema);
		if (!input) return fail(400, { values, errors });
		return translateCard(values, await chosenDeck(ownerId, input.deckId), input);
	},

	create: async (event) => {
		const ownerId = ownerOf(event);
		const form = await event.request.formData();
		const { values, errors, input } = readCardForm(form, newCardSchema);
		if (!input) return fail(400, { values, errors });
		const deck = await chosenDeck(ownerId, input.deckId);

		const warning = await duplicateWarning(cards, ownerId, deck, form, { values, input });
		if (warning) return warning;

		await cards.create(ownerId, deck.id, input, 'web');
		redirect(303, cardsOf(event.url, deck.id));
	}
};
