// Mise de côté du sens inverse (doc/specs/repetition.md, « Sessions ») : quand une révision
// sera-t-elle réellement présentée ? Fonctions pures, partagées par les compteurs de la
// session, l'échéancier et le détail d'une carte.
import type { Direction, Review } from '../cards/types';

/** Le sens inverse d'une carte notée est mis de côté pendant ce délai. */
export const SIBLING_BURY_MS = 24 * 60 * 60 * 1000;

export const opposite: Record<Direction, Direction> = {
	a_to_b: 'b_to_a',
	b_to_a: 'a_to_b'
};

/** Ce qu'il faut d'une révision pour savoir quand elle sera présentée. */
export type ReviewSlot = Pick<Review, 'id' | 'cardId' | 'direction' | 'due' | 'lastReview'>;

export interface Presentation {
	/**
	 * Fin de la mise de côté en cours (24 h après la dernière réponse au sens inverse),
	 * seulement si elle retarde la révision au-delà de son échéance.
	 */
	buriedUntil: Date | null;
	/**
	 * Moment où la révision sera présentée, si chaque révision est faite dès qu'elle est
	 * présentable : jamais avant l'échéance ni la fin de la mise de côté, et, quand les deux
	 * sens d'une carte viendraient à moins de 24 h d'intervalle, le second attend 24 h après
	 * le premier (qui le mettra de côté). Une date passée signifie « maintenant ».
	 */
	at: Date;
}

const later = (a: Date, b: Date) => (a.getTime() >= b.getTime() ? a : b);

function buriedUntil(review: ReviewSlot, sibling: ReviewSlot | undefined, now: Date): Date | null {
	if (!sibling?.lastReview) return null;
	const end = sibling.lastReview.getTime() + SIBLING_BURY_MS;
	return end > now.getTime() && end > review.due.getTime() ? new Date(end) : null;
}

/** Ordre de présentation de `next` : échéance effective, puis échéance, puis id. */
function byPresentation(a: { at: Date; review: ReviewSlot }, b: { at: Date; review: ReviewSlot }) {
	return (
		a.at.getTime() - b.at.getTime() ||
		a.review.due.getTime() - b.review.due.getTime() ||
		(a.review.id < b.review.id ? -1 : a.review.id > b.review.id ? 1 : 0)
	);
}

/**
 * Présentations des sens révisés de chaque carte (par id de carte), dans leur ordre de
 * présentation : le premier sens, puis le second, que la réponse au premier met de côté.
 */
export function presentationsByCard<R extends ReviewSlot>(
	reviews: readonly R[],
	now: Date
): Map<string, (Presentation & { review: R })[]> {
	const byCard = new Map<string, R[]>();
	for (const review of reviews) {
		const siblings = byCard.get(review.cardId);
		if (siblings) siblings.push(review);
		else byCard.set(review.cardId, [review]);
	}

	const result = new Map<string, (Presentation & { review: R })[]>();
	for (const [cardId, siblings] of byCard) {
		const slots = siblings
			.map((review) => {
				const sibling = siblings.find((s) => s.direction === opposite[review.direction]);
				const buried = buriedUntil(review, sibling, now);
				return { review, buried, at: buried ?? review.due };
			})
			.sort(byPresentation);

		const [first, second] = slots;
		if (!first) continue;
		const ordered = [{ review: first.review, buriedUntil: first.buried, at: first.at }];
		if (second) {
			// Répondre au premier sens mettra le second de côté pendant 24 h.
			const answeredAt = later(first.at, now);
			const at = later(second.at, new Date(answeredAt.getTime() + SIBLING_BURY_MS));
			ordered.push({ review: second.review, buriedUntil: second.buried, at });
		}
		result.set(cardId, ordered);
	}
	return result;
}

/** Présentation de chaque révision (par id), les deux sens d'une carte considérés ensemble. */
export function presentations(reviews: ReviewSlot[], now: Date): Map<string, Presentation> {
	const result = new Map<string, Presentation>();
	for (const slots of presentationsByCard(reviews, now).values()) {
		for (const { review, buriedUntil, at } of slots) result.set(review.id, { buriedUntil, at });
	}
	return result;
}
