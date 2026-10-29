import { fail, redirect } from '@sveltejs/kit';
import { NEW_DECK_VALUES } from '#lib/format/decks.js';
import { ConflictError } from '#lib/server/domain/index.js';
import { NAME_TAKEN, readNewDeckForm } from '#lib/server/web/deck-form.js';
import { ownerOf } from '#lib/server/web/guards.js';
import { decks } from '#lib/server/web/services.js';
import type { Actions, PageServerLoad } from './$types';

// Création d'un deck. C'est aussi l'accueil d'un nouveau compte : sans deck, les pages qui
// en ont besoin renvoient ici.
export const load: PageServerLoad = async ({ parent }) => ({
	values: NEW_DECK_VALUES,
	firstDeck: (await parent()).nav.decks.length === 0
});

export const actions: Actions = {
	default: async (event) => {
		const ownerId = ownerOf(event);
		const { values, errors, input } = readNewDeckForm(await event.request.formData());
		if (!input) return fail(400, { values, errors });

		let id: string;
		try {
			({ id } = await decks.create(ownerId, input));
		} catch (cause) {
			if (cause instanceof ConflictError)
				return fail(409, { values, errors: { name: NAME_TAKEN } });
			throw cause;
		}
		redirect(303, `/cards?deck=${id}`);
	}
};
