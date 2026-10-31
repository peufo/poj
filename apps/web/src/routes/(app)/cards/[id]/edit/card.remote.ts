import { redirect } from '@sveltejs/kit';
import { form, getRequestEvent } from '$app/server';
import { duplicateSide, resetsProgress } from '#lib/server/domain/index.js';
import { findDuplicate, translateCard, type CardFormResult } from '#lib/server/web/card-form.js';
import { ownerOf } from '#lib/server/web/guards.js';
import { cardFormSchema } from '#lib/server/web/schemas/cards.js';
import { cards, idOf, orNotFound } from '#lib/server/web/services.js';

/**
 * Modification de la carte de la page : suggestion DeepL, ou enregistrement après les
 * avertissements de réinitialisation de la progression et de doublon.
 */
export const updateCard = form(cardFormSchema, async (input): Promise<CardFormResult> => {
	const event = getRequestEvent();
	const ownerId = ownerOf(event);
	const id = idOf(event.params.id);
	const existing = await orNotFound(cards.get(ownerId, id));
	const { deck } = existing;
	if (input.intent === 'translate') return translateCard(deck, input);

	// L'avertissement de réinitialisation doit avoir été affiché avant d'enregistrer.
	if (resetsProgress(existing, input) && input.acknowledge_reset !== '1') {
		return { resetWarning: true };
	}
	// Modifier la face qui identifie la carte peut créer un doublon : même avertissement qu'à la création.
	const duplicate = await findDuplicate(cards, ownerId, deck, input, {
		excludeId: id,
		unchanged: existing[duplicateSide(deck)]
	});
	if (duplicate) return { duplicate };

	await orNotFound(cards.update(ownerId, id, input));
	redirect(303, `/cards/${id}`);
});
