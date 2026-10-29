import { fail, redirect } from '@sveltejs/kit';
import { duplicateWarning, readCardForm, translateAction } from '#lib/server/web/card-form.js';
import { cards, decks, deckView } from '#lib/server/web/services.js';
import { ownerOf } from '#lib/server/web/guards.js';
import type { Actions, PageServerLoad } from './$types';

// La carte va dans le deck par défaut : ses faces nomment les champs du formulaire.
export const load: PageServerLoad = async (event) => ({
	deck: deckView(await decks.ensureDefault(ownerOf(event)))
});

export const actions: Actions = {
	translate: async (event) => {
		const { request } = event;
		const deck = await decks.ensureDefault(ownerOf(event));
		return translateAction(await request.formData(), deck);
	},

	create: async (event) => {
		const { request } = event;
		const ownerId = ownerOf(event);
		const deck = await decks.ensureDefault(ownerId);
		const form = await request.formData();
		const { values, errors, input } = readCardForm(form, deck);
		if (!input) return fail(400, { values, errors });

		const warning = await duplicateWarning(cards, ownerId, deck, form, { values, input });
		if (warning) return warning;

		await cards.create(ownerId, input, 'web', new Date(), { deckId: deck.id });
		redirect(303, '/cards');
	}
};
