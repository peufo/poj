import { form, getRequestEvent } from '$app/server';
import { ownerOf } from '#lib/server/web/guards.js';
import { amendSchema, answerSchema, hintSchema } from '#lib/server/web/schemas/reviews.js';
import { orInvalid, orNotFound, reviews } from '#lib/server/web/services.js';

const owner = () => ownerOf(getRequestEvent());

/** Indice : le domaine mémorise la demande et plafonnera la note à Hard. */
export const hint = form(hintSchema, async ({ reviewId }) => {
	await orNotFound(reviews.requestHint(owner(), reviewId), 'Révision');
});

/** Note de la révision présentée. `replayed` : la même note, déjà enregistrée. */
export const answer = form(answerSchema, async ({ reviewId, rating, version }) => {
	const { replayed } = await orNotFound(
		orInvalid(
			reviews.answer(owner(), reviewId, { rating, version, origin: 'web' }),
			'Cette carte a changé entre-temps : la note n’a pas été enregistrée.'
		),
		'Révision'
	);
	return { replayed };
});

/** Corriger la dernière note. */
export const amend = form(amendSchema, async ({ reviewId, rating }) => {
	const { changed } = await orNotFound(
		orInvalid(
			reviews.amend(owner(), reviewId, rating),
			'Cette note ne peut plus être corrigée : seule la dernière réponse l’est, dans l’heure qui suit.'
		),
		'Révision'
	);
	// Même note qu'avant (plafond après indice compris) : rien n'a été modifié.
	return { unchanged: !changed };
});
