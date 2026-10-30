import { fail, redirect } from '@sveltejs/kit';
import { ConflictError } from '#lib/server/domain/index.js';
import { deckFormValues, NAME_TAKEN, readDeckEditForm } from '#lib/server/web/deck-form.js';
import { ownerOf } from '#lib/server/web/guards.js';
import { decks, idOf, orNotFound } from '#lib/server/web/services.js';
import type { Actions, PageServerLoad } from './$types';

// Modification d'un deck : nom, option des deux sens et, pour un sujet, noms des faces.
// Suppression du deck et de ses cartes.

export const load: PageServerLoad = async (event) => {
	const deck = await orNotFound(decks.get(ownerOf(event), idOf(event.params.id, 'Deck')), 'Deck');
	return { deck: { id: deck.id, name: deck.name }, values: deckFormValues(deck) };
};

export const actions: Actions = {
	save: async (event) => {
		const ownerId = ownerOf(event);
		const id = idOf(event.params.id, 'Deck');
		const deck = await orNotFound(decks.get(ownerId, id), 'Deck');
		const { values, errors, input } = readDeckEditForm(await event.request.formData(), deck);
		if (!input) return fail(400, { values, errors });

		try {
			await orNotFound(decks.update(ownerId, id, input), 'Deck');
		} catch (cause) {
			if (cause instanceof ConflictError)
				return fail(409, { values, errors: { name: NAME_TAKEN } });
			throw cause;
		}
		redirect(303, `/cards?deck=${id}`);
	},

	// Suppression en deux temps : sans `confirm`, on demande confirmation. Sans deck restant,
	// `/cards` renvoie à la création du premier.
	delete: async (event) => {
		const ownerId = ownerOf(event);
		const id = idOf(event.params.id, 'Deck');
		const form = await event.request.formData();
		if (form.get('confirm') !== '1') return fail(400, { confirmDelete: true });

		await orNotFound(decks.softDelete(ownerId, id), 'Deck');
		redirect(303, '/cards');
	}
};
