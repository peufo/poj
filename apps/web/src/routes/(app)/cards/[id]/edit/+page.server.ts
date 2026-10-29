import { fail, redirect } from '@sveltejs/kit';
import { duplicateSide, resetsProgress } from '#lib/server/domain/index.js';
import { duplicateWarning, readCardForm, translateAction } from '#lib/server/web/card-form.js';
import { cards, deckView, idOf, orNotFound } from '#lib/server/web/services.js';
import { ownerOf } from '#lib/server/web/guards.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const card = await orNotFound(cards.get(ownerOf(locals, url), idOf(params.id)));
	return {
		card: { id: card.id, sideA: card.sideA, sideB: card.sideB, context: card.context },
		deck: deckView(card.deck)
	};
};

export const actions: Actions = {
	translate: async ({ request, locals, params, url }) => {
		const { deck } = await orNotFound(cards.get(ownerOf(locals, url), idOf(params.id)));
		return translateAction(await request.formData(), deck);
	},

	update: async ({ request, locals, params, url }) => {
		const ownerId = ownerOf(locals, url);
		const id = idOf(params.id);
		const existing = await orNotFound(cards.get(ownerId, id));
		const { deck } = existing;
		const form = await request.formData();
		const { values, errors, input } = readCardForm(form, deck);
		if (!input) return fail(400, { values, errors });

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
