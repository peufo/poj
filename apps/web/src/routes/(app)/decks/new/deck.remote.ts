import { redirect } from '@sveltejs/kit';
import { form, getRequestEvent } from '$app/server';
import { NAME_TAKEN } from '#lib/server/web/deck-form.js';
import { ownerOf } from '#lib/server/web/guards.js';
import { newDeckSchema } from '#lib/server/web/schemas/decks.js';
import { decks, orInvalid } from '#lib/server/web/services.js';

/** Nouveau deck, puis ses cartes. */
export const createDeck = form(newDeckSchema, async (input, issue) => {
	const ownerId = ownerOf(getRequestEvent());
	const { id } = await orInvalid(decks.create(ownerId, input), issue.name(NAME_TAKEN));
	redirect(303, `/cards?deck=${id}`);
});
