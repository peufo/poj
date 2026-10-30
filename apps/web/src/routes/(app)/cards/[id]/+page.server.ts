import { redirect } from '@sveltejs/kit';
import { masteryOf } from '#lib/format/mastery.js';
import { presentations } from '#lib/server/domain/index.js';
import { unconfirmedDelete } from '#lib/server/web/delete-confirm.js';
import { cards, deckView, idOf, orNotFound } from '#lib/server/web/services.js';
import { ownerOf } from '#lib/server/web/guards.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { params } = event;
	const card = await orNotFound(cards.get(ownerOf(event), idOf(params.id)));
	const now = new Date();
	const shown = presentations(card.reviews, now);

	return {
		now,
		card: {
			id: card.id,
			sideA: card.sideA,
			sideB: card.sideB,
			deck: deckView(card.deck),
			context: card.context,
			origin: card.origin,
			createdAt: card.createdAt,
			reviews: card.reviews.map((review) => ({
				direction: review.direction,
				due: review.due,
				isNew: review.state === 'new',
				mastery: masteryOf(review),
				/** Mis de côté (l'autre sens vient d'être noté) : présenté à cette date. */
				buriedUntil: shown.get(review.id)?.buriedUntil ?? null,
				// Réponses depuis la dernière réinitialisation (`reps` FSRS, remis à 0 avec elle) ;
				// l'historique complet reste affiché à part.
				answers: review.reps,
				lastRating: review.reps > 0 ? (review.logs[0]?.rating ?? null) : null
			})),
			history: card.reviews
				.flatMap((review) =>
					review.logs.map((log) => ({
						id: log.id,
						at: log.reviewedAt,
						direction: review.direction,
						rating: log.rating,
						origin: log.origin,
						hintUsed: log.hintUsed,
						amended: log.amendedAt !== null
					}))
				)
				.sort((a, b) => b.at.getTime() - a.at.getTime())
		}
	};
};

export const actions: Actions = {
	// Suppression en deux temps (`DeleteConfirm`).
	delete: async (event) => {
		const { request, params } = event;
		const ownerId = ownerOf(event);
		const id = idOf(params.id);
		const unconfirmed = unconfirmedDelete(await request.formData());
		if (unconfirmed) return unconfirmed;

		await orNotFound(cards.softDelete(ownerId, id));
		redirect(303, '/cards');
	}
};
