import { fail, redirect } from '@sveltejs/kit';
import { duplicateSide, resetsProgress } from '#lib/server/domain/index.js';
import { readCardForm, translateAction } from '#lib/server/web/card-form.js';
import { cards, deckView, idOf, orNotFound, ownerOf } from '#lib/server/web/services.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const card = await orNotFound(cards.get(ownerOf(locals), idOf(params.id)));
	return {
		card: { id: card.id, sideA: card.sideA, sideB: card.sideB, context: card.context },
		deck: deckView(card.deck)
	};
};

export const actions: Actions = {
	translate: async ({ request, locals, params }) => {
		const { deck } = await orNotFound(cards.get(ownerOf(locals), idOf(params.id)));
		return translateAction(await request.formData(), deck);
	},

	update: async ({ request, locals, params }) => {
		const ownerId = ownerOf(locals);
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
		const side = duplicateSide(deck);
		const key = values[side].trim();
		if (key !== existing[side] && form.get('confirm') !== key) {
			const [duplicate] = await cards.findDuplicates(ownerId, deck, input, { excludeId: id });
			if (duplicate) {
				return fail(409, {
					values,
					duplicate: {
						id: duplicate.id,
						sideA: duplicate.sideA,
						sideB: duplicate.sideB,
						context: duplicate.context,
						forValue: key
					}
				});
			}
		}

		await orNotFound(cards.update(ownerId, id, input));
		redirect(303, `/cards/${id}`);
	}
};
