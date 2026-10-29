import { fail, redirect } from '@sveltejs/kit';
import { duplicateSide } from '#lib/server/domain/index.js';
import { readCardForm, translateAction } from '#lib/server/web/card-form.js';
import { cards, decks, deckView, ownerOf } from '#lib/server/web/services.js';
import type { Actions, PageServerLoad } from './$types';

// La carte va dans le deck par défaut : ses faces nomment les champs du formulaire.
export const load: PageServerLoad = async ({ locals }) => ({
	deck: deckView(await decks.ensureDefault(ownerOf(locals)))
});

export const actions: Actions = {
	translate: async ({ request, locals }) => {
		const deck = await decks.ensureDefault(ownerOf(locals));
		return translateAction(await request.formData(), deck);
	},

	create: async ({ request, locals }) => {
		const ownerId = ownerOf(locals);
		const deck = await decks.ensureDefault(ownerId);
		const form = await request.formData();
		const { values, errors, input } = readCardForm(form, deck);
		if (!input) return fail(400, { values, errors });

		// Doublon en deux temps : on avertit, puis on enregistre si la face avertie est confirmée.
		const key = values[duplicateSide(deck)].trim();
		if (form.get('confirm') !== key) {
			const [duplicate] = await cards.findDuplicates(ownerId, deck, input);
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

		await cards.create(ownerId, input, 'web');
		redirect(303, '/cards');
	}
};
