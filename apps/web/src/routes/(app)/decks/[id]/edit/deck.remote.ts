import { redirect } from '@sveltejs/kit';
import { form, getRequestEvent } from '$app/server';
import { NAME_TAKEN } from '#lib/server/web/deck-form.js';
import { ownerOf } from '#lib/server/web/guards.js';
import { deckUpdateSchema } from '#lib/server/web/schemas/decks.js';
import { decks, idOf, orInvalid, orNotFound } from '#lib/server/web/services.js';

/** Deck de la page et son propriétaire. */
function deckOfPage() {
	const event = getRequestEvent();
	return { ownerId: ownerOf(event), id: idOf(event.params.id, 'Deck') };
}

/**
 * Nom, option des deux sens et noms des faces (ignorés pour une langue par `decks.update`).
 * Le type et les langues ne changent pas.
 */
export const saveDeck = form(deckUpdateSchema, async (input, issue) => {
	const { ownerId, id } = deckOfPage();
	await orNotFound(orInvalid(decks.update(ownerId, id, input), issue.name(NAME_TAKEN)), 'Deck');
	redirect(303, `/cards?deck=${id}`);
});

/**
 * Suppression du deck et de ses cartes, confirmée dans la page (`DeleteConfirm`). Sans deck
 * restant, `/cards` renvoie à la création du premier.
 */
export const deleteDeck = form(async () => {
	const { ownerId, id } = deckOfPage();
	await orNotFound(decks.softDelete(ownerId, id), 'Deck');
	redirect(303, '/cards');
});
