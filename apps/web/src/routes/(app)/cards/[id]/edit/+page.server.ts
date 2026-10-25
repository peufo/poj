import { fail, redirect } from '@sveltejs/kit';
import { resetsProgress } from '#lib/server/domain/index.js';
import { readCardForm, translateAction } from '#lib/server/web/card-form.js';
import { cards, idOf, orNotFound, ownerOf } from '#lib/server/web/services.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const card = await orNotFound(cards.get(ownerOf(locals), idOf(params.id)));
	return {
		card: { id: card.id, french: card.french, english: card.english, context: card.context }
	};
};

export const actions: Actions = {
	translate: async ({ request, locals }) => {
		ownerOf(locals);
		return translateAction(await request.formData());
	},

	update: async ({ request, locals, params }) => {
		const ownerId = ownerOf(locals);
		const id = idOf(params.id);
		const form = await request.formData();
		const { values, errors, input } = readCardForm(form);
		if (!input) return fail(400, { values, errors });

		const existing = await orNotFound(cards.get(ownerId, id));

		// L'avertissement de réinitialisation doit avoir été affiché avant d'enregistrer.
		if (resetsProgress(existing, input) && form.get('acknowledge_reset') !== '1') {
			return fail(409, { values, resetWarning: true });
		}

		// Un nouvel anglais peut créer un doublon : même avertissement qu'à la création.
		const english = values.english.trim();
		if (english !== existing.english && form.get('confirm') !== english) {
			const [duplicate] = await cards.findDuplicates(ownerId, english, { excludeId: id });
			if (duplicate) {
				return fail(409, {
					values,
					duplicate: {
						id: duplicate.id,
						french: duplicate.french,
						english: duplicate.english,
						context: duplicate.context,
						forEnglish: english
					}
				});
			}
		}

		await orNotFound(cards.update(ownerId, id, input));
		redirect(303, `/cards/${id}`);
	}
};
