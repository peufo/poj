import { redirect } from '@sveltejs/kit';
import { form, getRequestEvent } from '$app/server';
import { ownerOf } from '#lib/server/web/guards.js';
import { cards, idOf, orNotFound } from '#lib/server/web/services.js';

/** Suppression de la carte de la page, confirmée dans la page (`DeleteConfirm`). */
export const deleteCard = form(async () => {
	const event = getRequestEvent();
	await orNotFound(cards.softDelete(ownerOf(event), idOf(event.params.id)));
	redirect(303, '/cards');
});
