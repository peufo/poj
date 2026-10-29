import { fail, redirect } from '@sveltejs/kit';
import { NO_DECK } from '#lib/format/decks.js';
import {
	duplicateWarning,
	readCardForm,
	text,
	translateAction
} from '#lib/server/web/card-form.js';
import { cards, decks, idOf, orNotFound } from '#lib/server/web/services.js';
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

/**
 * Deck choisi dans le formulaire (`deckId`, renvoyé avec les valeurs pour que la liste le
 * garde sans JavaScript), `null` si aucun ; 404 s'il n'est pas au propriétaire.
 */
async function chosenDeck(ownerId: string, form: FormData) {
	const value = text(form, 'deckId');
	return value ? orNotFound(decks.get(ownerId, idOf(value, 'Deck')), 'Deck') : null;
}

/** Sans deck choisi : à choisir d'abord. */
function noDeck(form: FormData) {
	const { values } = readCardForm(form, NO_DECK);
	return fail(400, { values, deckError: 'Choisis un deck.' });
}

/** Page où revenir après l'enregistrement : le deck si l'on en vient, sinon toutes les cartes. */
const cardsOf = (url: URL, deckId: string) =>
	url.searchParams.has('deck') ? `/cards?deck=${deckId}` : '/cards';

export const actions: Actions = {
	translate: async (event) => {
		const ownerId = ownerOf(event);
		const form = await event.request.formData();
		const deck = await chosenDeck(ownerId, form);
		if (!deck) return noDeck(form);
		return translateAction(form, deck);
	},

	create: async (event) => {
		const ownerId = ownerOf(event);
		const form = await event.request.formData();
		const deck = await chosenDeck(ownerId, form);
		if (!deck) return noDeck(form);
		const { values, errors, input } = readCardForm(form, deck);
		if (!input) return fail(400, { values, errors });

		const warning = await duplicateWarning(cards, ownerId, deck, form, { values, input });
		if (warning) return warning;

		await cards.create(ownerId, deck.id, input, 'web');
		redirect(303, cardsOf(event.url, deck.id));
	}
};
