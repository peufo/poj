import { redirect } from '@sveltejs/kit';
import { form, getRequestEvent } from '$app/server';
import { deckName } from '#lib/server/domain/index.js';
import { languageTaken, NAME_TAKEN } from '#lib/server/web/deck-form.js';
import { ownerOf } from '#lib/server/web/guards.js';
import { newDeckSchema } from '#lib/server/web/schemas/decks.js';
import { decks, orInvalid } from '#lib/server/web/services.js';

/**
 * Nouveau deck, puis ses cartes. Une langue n'a pas de champ nom : son nom déjà pris est
 * signalé sur la langue apprise.
 */
export const createDeck = form(newDeckSchema, async (input, issue) => {
	const ownerId = ownerOf(getRequestEvent());
	const taken =
		input.kind === 'language'
			? issue.languageB(languageTaken(deckName(input)))
			: issue.name(NAME_TAKEN);
	const { id } = await orInvalid(decks.create(ownerId, input), taken);
	redirect(303, `/cards?deck=${id}`);
});
