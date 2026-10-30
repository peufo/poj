import { fail, redirect } from '@sveltejs/kit';
import { duplicateSide, resetsProgress } from '#lib/server/domain/index.js';
import { duplicateWarning, readCardForm, translateCard } from '#lib/server/web/card-form.js';
import { cardSchema, cardTranslationSchema } from '#lib/server/web/schemas/cards.js';
import { cards, deckView, idOf, orNotFound } from '#lib/server/web/services.js';
import { ownerOf } from '#lib/server/web/guards.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { params } = event;
	const card = await orNotFound(cards.get(ownerOf(event), idOf(params.id)));
	return {
		card: { id: card.id, sideA: card.sideA, sideB: card.sideB, context: card.context },
		deck: deckView(card.deck)
	};
};

export const actions: Actions = {
	translate: async (event) => {
		const { request, params } = event;
		const ownerId = ownerOf(event);
		const id = idOf(params.id);
		const { values, errors, input } = readCardForm(await request.formData(), cardTranslationSchema);
		if (!input) return fail(400, { values, errors });
		const { deck } = await orNotFound(cards.get(ownerId, id));
		return translateCard(values, deck, input);
	},

	update: async (event) => {
		const { request, params } = event;
		const ownerId = ownerOf(event);
		const id = idOf(params.id);
		const form = await request.formData();
		const { values, errors, input } = readCardForm(form, cardSchema);
		if (!input) return fail(400, { values, errors });
		const existing = await orNotFound(cards.get(ownerId, id));
		const { deck } = existing;

		// L'avertissement de réinitialisation doit avoir été affiché avant d'enregistrer.
		if (resetsProgress(existing, input) && form.get('acknowledge_reset') !== '1') {
			return fail(409, { values, resetWarning: true });
		}

		// Modifier la face qui identifie la carte peut créer un doublon : même avertissement qu'à la création.
		const warning = await duplicateWarning(
			cards,
			ownerId,
			deck,
			form,
			{ values, input },
			{ excludeId: id, unchanged: existing[duplicateSide(deck)] }
		);
		if (warning) return warning;

		await orNotFound(cards.update(ownerId, id, input));
		redirect(303, `/cards/${id}`);
	}
};
