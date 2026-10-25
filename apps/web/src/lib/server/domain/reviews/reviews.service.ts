import type { Db } from '../db';
import { ConflictError, NotFoundError } from '../errors';
import type { Direction, Origin, Rating, Review } from '../cards/types';
import { applyRating, parseState, serializeState, type SerializedState } from './scheduler';
import type { AnswerResult, NextResult } from './types';

export type ReviewsService = ReturnType<typeof createReviewsService>;

/** Le sens inverse d'une carte notée est mis de côté pendant ce délai. */
const SIBLING_BURY_MS = 24 * 60 * 60 * 1000;
/** Délai pendant lequel la dernière note d'une révision peut être corrigée. */
const AMEND_WINDOW_MS = 60 * 60 * 1000;

const opposite: Record<Direction, Direction> = { fr_to_en: 'en_to_fr', en_to_fr: 'fr_to_en' };

const versionOf = (review: Pick<Review, 'lastReview'>) => review.lastReview?.toISOString() ?? 'new';

const hintUsedOn = (review: Pick<Review, 'hintRequestedAt' | 'lastReview'>) =>
	review.hintRequestedAt !== null &&
	(review.lastReview === null || review.hintRequestedAt > review.lastReview);

export function createReviewsService(db: Db) {
	const owned = (ownerId: string) => ({ card: { ownerId, deletedAt: null } });

	async function findOwned(ownerId: string, id: string) {
		const review = await db.review.findFirst({
			where: { id, ...owned(ownerId) },
			include: { card: true }
		});
		if (!review) throw new NotFoundError(`Review ${id} not found`);
		return review;
	}

	/** Filtre excluant le sens inverse des cartes notées dans les dernières 24 h. */
	async function buriedFilter(ownerId: string, now: Date) {
		const recent = await db.review.findMany({
			where: { lastReview: { gt: new Date(now.getTime() - SIBLING_BURY_MS) }, ...owned(ownerId) },
			select: { cardId: true, direction: true }
		});
		if (recent.length === 0) return {};
		return {
			NOT: {
				OR: recent.map(({ cardId, direction }) => ({ cardId, direction: opposite[direction] }))
			}
		};
	}

	return {
		/**
		 * Prochaine révision à présenter : la plus en retard d'abord. Avec `ahead`, les
		 * révisions à venir sont aussi candidates (révision en avance).
		 */
		async next(ownerId: string, now = new Date(), { ahead = false } = {}): Promise<NextResult> {
			const available = { ...owned(ownerId), ...(await buriedFilter(ownerId, now)) };
			const dueNow = { ...available, due: { lte: now } };

			const [review, remaining] = await Promise.all([
				db.review.findFirst({
					where: ahead ? available : dueNow,
					orderBy: [{ due: 'asc' }, { id: 'asc' }],
					include: { card: true }
				}),
				db.review.count({ where: dueNow })
			]);

			if (!review) {
				const upcoming = await db.review.findFirst({
					where: available,
					orderBy: { due: 'asc' },
					select: { due: true }
				});
				return { review: null, nextDue: upcoming?.due ?? null };
			}

			const { card } = review;
			const frToEn = review.direction === 'fr_to_en';
			return {
				review: {
					id: review.id,
					cardId: card.id,
					direction: review.direction,
					prompt: frToEn ? card.french : card.english,
					expected: frToEn ? card.english : card.french,
					hasHint: card.context !== null,
					version: versionOf(review)
				},
				remaining
			};
		},

		/** Renvoie le contexte de la carte et mémorise qu'un indice a été demandé. */
		async requestHint(
			ownerId: string,
			reviewId: string,
			now = new Date()
		): Promise<{ context: string | null }> {
			const review = await findOwned(ownerId, reviewId);
			if (review.card.context === null) return { context: null };
			await db.review.update({ where: { id: reviewId }, data: { hintRequestedAt: now } });
			return { context: review.card.context };
		},

		/**
		 * Enregistre une note. Rejouer avec une `version` périmée renvoie la note déjà
		 * enregistrée sans rien appliquer une seconde fois.
		 */
		async answer(
			ownerId: string,
			reviewId: string,
			{ rating, version, origin }: { rating: Rating; version: string; origin: Origin },
			now = new Date()
		): Promise<AnswerResult> {
			const review = await findOwned(ownerId, reviewId);

			const replay = async (): Promise<AnswerResult> => {
				const current = await db.review.findUniqueOrThrow({
					where: { id: reviewId },
					include: { logs: { orderBy: { reviewedAt: 'desc' }, take: 1 } }
				});
				const [last] = current.logs;
				if (!last) throw new ConflictError(`Review ${reviewId} has changed`);
				return {
					reviewId,
					rating: last.rating,
					due: current.due,
					context: review.card.context,
					replayed: true
				};
			};

			if (version !== versionOf(review)) return replay();

			const hintUsed = hintUsedOn(review);
			const next = applyRating(review, rating, now, { hintUsed });

			const applied = await db.$transaction(async (tx) => {
				// Garde optimiste : ne s'applique que si personne n'a noté entre-temps.
				const { count } = await tx.review.updateMany({
					where: { id: reviewId, lastReview: review.lastReview },
					data: next.state
				});
				if (count === 0) return false;
				await tx.reviewLog.create({
					data: {
						reviewId,
						rating: next.rating,
						hintUsed,
						origin,
						reviewedAt: now,
						stateBefore: serializeState(review)
					}
				});
				return true;
			});
			if (!applied) return replay();

			return {
				reviewId,
				rating: next.rating,
				due: next.state.due,
				context: review.card.context,
				replayed: false
			};
		},

		/**
		 * Corrige la dernière note d'une révision, dans l'heure qui suit : l'état est
		 * recalculé depuis l'état antérieur conservé dans l'historique.
		 */
		async amend(
			ownerId: string,
			reviewId: string,
			rating: Rating,
			now = new Date()
		): Promise<AnswerResult> {
			const review = await findOwned(ownerId, reviewId);
			const last = await db.reviewLog.findFirst({
				where: { reviewId },
				orderBy: { reviewedAt: 'desc' }
			});

			if (!last) throw new ConflictError(`Review ${reviewId} has no answer to amend`);
			if (now.getTime() - last.reviewedAt.getTime() > AMEND_WINDOW_MS) {
				throw new ConflictError(`Answer on review ${reviewId} is too old to amend`);
			}
			// Une réinitialisation (carte modifiée) depuis la réponse interdit la correction.
			if (review.lastReview?.getTime() !== last.reviewedAt.getTime()) {
				throw new ConflictError(`Review ${reviewId} has changed since its last answer`);
			}

			const before = parseState(last.stateBefore as unknown as SerializedState);
			const next = applyRating(before, rating, last.reviewedAt, { hintUsed: last.hintUsed });

			await db.$transaction([
				db.review.update({ where: { id: reviewId }, data: next.state }),
				db.reviewLog.update({
					where: { id: last.id },
					data: { rating: next.rating, amendedAt: now }
				})
			]);

			return {
				reviewId,
				rating: next.rating,
				due: next.state.due,
				context: review.card.context,
				replayed: false
			};
		}
	};
}
