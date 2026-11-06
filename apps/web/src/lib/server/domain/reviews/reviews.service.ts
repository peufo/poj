import type { Db } from '../db';
import { reviewedDirections } from '../decks/decks.service';
import { ConflictError, NotFoundError } from '../errors';
import { hintOf } from '../cards/hint';
import type { Card, Direction, Origin, Rating, Review, ReviewLog } from '../cards/types';
import { applyRating, pickState, previewDue } from './scheduler';
import { startOfNextDay } from '../time';
import { opposite, SIBLING_BURY_MS } from './availability';
import { findNewCards, presentableCard, type NewCards } from './new-cards';
import type {
	AmendResult,
	AnswerResult,
	LastAnswer,
	LeadResult,
	NextResult,
	NextReview
} from './types';

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

/** Face présentée par un sens : A pour `a_to_b`, B pour `b_to_a`. */
const promptOf = (direction: Direction, card: Pick<Card, 'sideA' | 'sideB'>) =>
	direction === 'a_to_b' ? card.sideA : card.sideB;

const withDeck = { card: { include: { deck: true } } } as const;

/** Portée d'une session : tous les decks, ou le deck `deckId`. */
export interface ReviewScope {
	deckId?: string;
}

export function createReviewsService(db: Db) {
	/**
	 * Révisions du propriétaire : sens révisés des cartes non supprimées (du deck `deckId`
	 * s'il est précisé). Une `b_to_a` d'un deck passé à sens unique n'en fait plus partie.
	 * Avec `fresh`, sans les cartes neuves en attente.
	 */
	const owned = (ownerId: string, deckId?: string, fresh?: NewCards) => ({
		card: { ownerId, deletedAt: null, deckId, ...(fresh && presentableCard(fresh)) },
		...reviewedDirections
	});

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
			where: {
				lastReview: { gt: new Date(now.getTime() - SIBLING_BURY_MS) },
				...owned(ownerId)
			},
			select: { cardId: true, direction: true }
		});
		if (recent.length === 0) return {};
		return {
			NOT: {
				OR: recent.map(({ cardId, direction }) => ({ cardId, direction: opposite[direction] }))
			}
		};
	}

	/**
	 * Ce qui écarte une révision de la session à cet instant : sens inverse mis de côté, et
	 * cartes neuves au-delà de la limite du jour de leur deck (`findNewCards`).
	 */
	async function presentability(ownerId: string, now: Date, { deckId }: ReviewScope) {
		const [buried, fresh] = await Promise.all([
			buriedFilter(ownerId, now),
			findNewCards(db, ownerId, now, deckId)
		]);
		return { buried, fresh };
	}

	type Presentability = Awaited<ReturnType<typeof presentability>>;

	/**
	 * Révisions présentables : sens révisés des cartes non supprimées (du deck de la
	 * session), sens inverse mis de côté et cartes neuves en attente exclus.
	 */
	function availableFilter(
		ownerId: string,
		{ deckId }: ReviewScope,
		{ buried, fresh }: Presentability
	) {
		return { ...owned(ownerId, deckId, fresh), ...buried };
	}

	/**
	 * Révisions qui seront présentées dans la session en cours : au plus une par carte, car
	 * répondre à un sens met l'autre de côté (et les sens déjà mis de côté sont exclus).
	 * C'est donc le nombre de cartes ayant une révision présentable maintenant.
	 */
	function countPresentable(
		ownerId: string,
		now: Date,
		{ deckId }: ReviewScope,
		{ buried, fresh }: Presentability
	): Promise<number> {
		return db.card.count({
			where: {
				...owned(ownerId, deckId, fresh).card,
				reviews: { some: { ...buried, ...reviewedDirections, due: { lte: now } } }
			}
		});
	}

	/**
	 * Révision présentable la plus en retard, hors cartes `exclude`. Avec `ahead`, les
	 * révisions à venir sont aussi candidates.
	 */
	async function pick(
		ownerId: string,
		now: Date,
		scope: ReviewScope,
		presentable: Presentability,
		{ ahead, exclude = [] }: { ahead: boolean; exclude?: readonly string[] }
	): Promise<NextReview | null> {
		const available = availableFilter(ownerId, scope, presentable);
		const review = await db.review.findFirst({
			where: {
				...available,
				...(!ahead && { due: { lte: now } }),
				...(exclude.length > 0 && { cardId: { notIn: [...exclude] } })
			},
			orderBy: [{ due: 'asc' }, { id: 'asc' }],
			include: withDeck
		});
		if (!review) return null;

		const { card } = review;
		return {
			id: review.id,
			cardId: card.id,
			deck: card.deck,
			direction: review.direction,
			prompt: promptOf(review.direction, card),
			expected: promptOf(opposite[review.direction], card),
			hint: hintOf(card.context),
			context: card.context,
			hintUsed: hintUsedOn(review),
			isNew: review.state === 'new',
			due: review.due,
			preview: previewDue(review, now),
			version: versionOf(review)
		};
	}

	/**
	 * Prochaine échéance quand rien n'est présentable : la révision à venir la plus proche,
	 * ou minuit si des cartes neuves attendent (la limite repart alors).
	 */
	async function upcoming(
		ownerId: string,
		now: Date,
		scope: ReviewScope,
		presentable: Presentability
	): Promise<{ nextDue: Date | null; waiting: number }> {
		const next = await db.review.findFirst({
			where: availableFilter(ownerId, scope, presentable),
			orderBy: { due: 'asc' },
			select: { due: true }
		});
		const waiting = presentable.fresh.held.length;
		const tomorrow = waiting > 0 ? startOfNextDay(now) : null;
		const nextDue = next && (!tomorrow || next.due < tomorrow) ? next.due : tomorrow;
		return { nextDue, waiting };
	}

	return {
		/**
		 * Nombre de révisions à présenter maintenant : dues, hors sens mis de côté et cartes
		 * neuves en attente, et au plus une par carte (l'autre sens sera mis de côté après la
		 * réponse).
		 */
		async countDue(ownerId: string, now = new Date(), scope: ReviewScope = {}): Promise<number> {
			return countPresentable(ownerId, now, scope, await presentability(ownerId, now, scope));
		},

		/**
		 * Prochaine révision à présenter : la plus en retard d'abord. Avec `ahead`, les
		 * révisions à venir sont aussi candidates (révision en avance), mais jamais les cartes
		 * neuves en attente. Avec `deckId`, seules les cartes de ce deck. Sans révision, la
		 * prochaine échéance tient compte des cartes neuves en attente, présentées au plus tôt
		 * le lendemain.
		 */
		async next(
			ownerId: string,
			now = new Date(),
			{ ahead = false, ...scope }: { ahead?: boolean } & ReviewScope = {}
		): Promise<NextResult> {
			const presentable = await presentability(ownerId, now, scope);
			const [review, remaining] = await Promise.all([
				pick(ownerId, now, scope, presentable, { ahead }),
				countPresentable(ownerId, now, scope, presentable)
			]);
			if (!review) return { review: null, ...(await upcoming(ownerId, now, scope, presentable)) };
			return { review, remaining };
		},

		/**
		 * Révisions qui gardent une carte d'avance à Claude : deux, de cartes différentes, s'il
		 * ne tient aucune carte, une sinon (moins s'il n'y en a plus). `holding` est l'id de la
		 * révision qu'il tient : elle et l'autre sens de sa carte sont exclus. Un id inconnu ou
		 * d'un autre propriétaire est ignoré. Mêmes règles que `next` pour le reste. À appeler
		 * après l'enregistrement de la note : une carte ratée qui doit revenir vite le peut.
		 */
		async lead(
			ownerId: string,
			now = new Date(),
			{ ahead = false, holding, ...scope }: { ahead?: boolean; holding?: string } & ReviewScope = {}
		): Promise<LeadResult> {
			const [held, presentable] = await Promise.all([
				holding === undefined
					? null
					: db.review.findFirst({
							where: { id: holding, card: { ownerId } },
							select: { cardId: true }
						}),
				presentability(ownerId, now, scope)
			]);
			const picks = async () => {
				const exclude = held ? [held.cardId] : [];
				const reviews: NextReview[] = [];
				while (reviews.length < (held ? 1 : 2)) {
					const review = await pick(ownerId, now, scope, presentable, { ahead, exclude });
					if (!review) break;
					reviews.push(review);
					exclude.push(review.cardId);
				}
				return reviews;
			};
			const [reviews, remaining] = await Promise.all([
				picks(),
				countPresentable(ownerId, now, scope, presentable)
			]);
			const nextDue =
				reviews.length === 0 && !held
					? (await upcoming(ownerId, now, scope, presentable)).nextDue
					: null;
			return { reviews, held: held !== null, remaining, nextDue };
		},

		/** Cartes neuves en attente (au-delà de la limite du jour de leur deck). */
		async heldNewCards(
			ownerId: string,
			now = new Date(),
			{ deckId }: ReviewScope = {}
		): Promise<Set<string>> {
			return new Set((await findNewCards(db, ownerId, now, deckId)).held);
		},

		/**
		 * La réponse la plus récente de l'utilisateur, si elle peut encore être corrigée
		 * (dans l'heure, et révision inchangée depuis) ; sinon `null`. Avec `deckId`, la plus
		 * récente sur ce deck.
		 */
		async lastAnswer(
			ownerId: string,
			now = new Date(),
			{ deckId }: ReviewScope = {}
		): Promise<LastAnswer | null> {
			const log = await db.reviewLog.findFirst({
				where: {
					reviewedAt: { gte: new Date(now.getTime() - AMEND_WINDOW_MS) },
					review: owned(ownerId, deckId)
				},
				orderBy: { reviewedAt: 'desc' },
				include: { review: { include: withDeck } }
			});
			if (!log || amendBlocker(log, log.review, now)) return null;

			const { review } = log;
			return {
				reviewId: review.id,
				cardId: review.cardId,
				deck: review.card.deck,
				direction: review.direction,
				prompt: promptOf(review.direction, review.card),
				rating: log.rating,
				hintUsed: log.hintUsed,
				reviewedAt: log.reviewedAt,
				due: review.due,
				preview: previewDue(log, log.reviewedAt)
			};
		},

		/**
		 * Renvoie l'indice de la carte (son contexte sans les mentions de source, `hintOf`) et
		 * mémorise qu'un indice a été demandé. Sans indice, rien n'est mémorisé.
		 */
		async requestHint(
			ownerId: string,
			reviewId: string,
			now = new Date()
		): Promise<{ context: string | null }> {
			const review = await findOwned(ownerId, reviewId);
			const hint = hintOf(review.card.context);
			if (hint === null) return { context: null };
			await db.review.update({ where: { id: reviewId }, data: { hintRequestedAt: now } });
			return { context: hint };
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
						...pickState(review)
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

			const next = applyRating(last, rating, last.reviewedAt, { hintUsed: last.hintUsed });

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
