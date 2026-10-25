import { fail, redirect } from '@sveltejs/kit';
import { readCardForm, translateAction } from '#lib/server/web/card-form.js';
import { cards, ownerOf } from '#lib/server/web/services.js';
import type { Actions } from './$types';

export const actions: Actions = {
	translate: async ({ request, locals }) => {
		ownerOf(locals);
		return translateAction(await request.formData());
	},

	create: async ({ request, locals }) => {
		const ownerId = ownerOf(locals);
		const form = await request.formData();
		const { values, errors, input } = readCardForm(form);
		if (!input) return fail(400, { values, errors });

		// Doublon en deux temps : on avertit, puis on enregistre si l'anglais averti est confirmé.
		const english = values.english.trim();
		if (form.get('confirm') !== english) {
			const [duplicate] = await cards.findDuplicates(ownerId, english);
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

		await cards.create(ownerId, input, 'web');
		redirect(303, '/cards');
	}
};
