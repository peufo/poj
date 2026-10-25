import type { Db } from '../db';
import { ConflictError, NotFoundError } from '../errors';
import type { Card, Direction, Origin, Rating, Review, ReviewLog } from '../cards/types';
import {
	applyRating,
	parseState,
	previewDue,
	serializeState,
	type SerializedState
} from './scheduler';
import { opposite, SIBLING_BURY_MS } from './availability';
import type { AmendResult, AnswerResult, LastAnswer, NextResult } from './types';

export type ReviewsService = ReturnType<typeof createReviewsService>;

/** Délai pendant lequel la dernière note d'une révision peut être corrigée. */
const AMEND_WINDOW_MS = 60 * 60 * 1000;

const versionOf = (review: Pick<Review, 'lastReview'>) => review.lastReview?.toISOString() ?? 'new';

const hintUsedOn = (review: Pick<Review, 'hintRequestedAt' | 'lastReview'>) =>
	review.hintRequestedAt !== null &&
	(review.lastReview === null || review.hintRequestedAt > review.lastReview);

/** Une réponse est corrigeable dans l'heure, tant que la révision n'a pas changé depuis. */
function amendBlocker(
	log: Pick<ReviewLog, 'reviewedAt'>,
	review: Pick<Review, 'lastReview'>,
	now: Date
): string | null {
	if (now.getTime() - log.reviewedAt.getTime() > AMEND_WINDOW_MS) return 'is too old to amend';
	// Une réinitialisation (carte modifiée) depuis la réponse interdit la correction.
	if (review.lastReview?.getTime() !== log.reviewedAt.getTime()) {
		return 'has changed since its last answer';
	}
	return null;
}

const promptOf = (direction: Direction, card: Pick<Card, 'french' | 'english'>) =>
	direction === 'fr_to_en' ? card.french : card.english;

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

	/** Révisions présentables : cartes non supprimées, sens inverse mis de côté. */
	async function availableFilter(ownerId: string, now: Date) {
		return { ...owned(ownerId), ...(await buriedFilter(ownerId, now)) };
	}

	/**
	 * Révisions qui seront présentées dans la session en cours : au plus une par carte, car
	 * répondre à un sens met l'autre de côté (et les sens déjà mis de côté sont exclus).
	 * C'est donc le nombre de cartes ayant une révision présentable maintenant.
	 */
	async function countPresentable(ownerId: string, now: Date): Promise<number> {
		const buried = await buriedFilter(ownerId, now);
		return db.card.count({
			where: { ownerId, deletedAt: null, reviews: { some: { ...buried, due: { lte: now } } } }
		});
	}

	return {
		/**
		 * Nombre de révisions à présenter maintenant : dues, hors sens mis de côté, et au plus
		 * une par carte (l'autre sens sera mis de côté après la réponse).
		 */
		countDue(ownerId: string, now = new Date()): Promise<number> {
			return countPresentable(ownerId, now);
		},

		/**
		 * Prochaine révision à présenter : la plus en retard d'abord. Avec `ahead`, les
		 * révisions à venir sont aussi candidates (révision en avance).
		 */
		async next(ownerId: string, now = new Date(), { ahead = false } = {}): Promise<NextResult> {
			const available = await availableFilter(ownerId, now);
			const dueNow = { ...available, due: { lte: now } };

			const [review, remaining] = await Promise.all([
				db.review.findFirst({
					where: ahead ? available : dueNow,
					orderBy: [{ due: 'asc' }, { id: 'asc' }],
					include: { card: true }
				}),
				countPresentable(ownerId, now)
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
			return {
				review: {
					id: review.id,
					cardId: card.id,
					direction: review.direction,
					prompt: promptOf(review.direction, card),
					expected: promptOf(opposite[review.direction], card),
					hasHint: card.context !== null,
					context: card.context,
					hintUsed: hintUsedOn(review),
					isNew: review.state === 'new',
					due: review.due,
					preview: previewDue(review, now),
					version: versionOf(review)
				},
				remaining
			};
		},

		/**
		 * La réponse la plus récente de l'utilisateur, si elle peut encore être corrigée
		 * (dans l'heure, et révision inchangée depuis) ; sinon `null`.
		 */
		async lastAnswer(ownerId: string, now = new Date()): Promise<LastAnswer | null> {
			const log = await db.reviewLog.findFirst({
				where: {
					reviewedAt: { gte: new Date(now.getTime() - AMEND_WINDOW_MS) },
					review: owned(ownerId)
				},
				orderBy: { reviewedAt: 'desc' },
				include: { review: { include: { card: true } } }
			});
			if (!log || amendBlocker(log, log.review, now)) return null;

			const { review } = log;
			const before = parseState(log.stateBefore as unknown as SerializedState);
			return {
				reviewId: review.id,
				cardId: review.cardId,
				direction: review.direction,
				prompt: promptOf(review.direction, review.card),
				rating: log.rating,
				hintUsed: log.hintUsed,
				reviewedAt: log.reviewedAt,
				due: review.due,
				preview: previewDue(before, log.reviewedAt)
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
		 * recalculé depuis l'état antérieur conservé dans l'historique. Si la note retenue
		 * (plafond après indice compris) est celle déjà enregistrée, rien n'est modifié.
		 */
		async amend(
			ownerId: string,
			reviewId: string,
			rating: Rating,
			now = new Date()
		): Promise<AmendResult> {
			const review = await findOwned(ownerId, reviewId);
			const last = await db.reviewLog.findFirst({
				where: { reviewId },
				orderBy: { reviewedAt: 'desc' }
			});

			if (!last) throw new ConflictError(`Review ${reviewId} has no answer to amend`);
			const blocker = amendBlocker(last, review, now);
			if (blocker) throw new ConflictError(`Answer on review ${reviewId} ${blocker}`);

			const before = parseState(last.stateBefore as unknown as SerializedState);
			const next = applyRating(before, rating, last.reviewedAt, { hintUsed: last.hintUsed });

			// Même note retenue (ex. Hard demandé après un indice, déjà Hard) : rien ne change.
			if (next.rating === last.rating) {
				return {
					reviewId,
					rating: last.rating,
					due: review.due,
					context: review.card.context,
					replayed: false,
					changed: false
				};
			}

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
				replayed: false,
				changed: true
			};
		}
	};
}
