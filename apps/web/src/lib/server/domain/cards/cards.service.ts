import type { Db } from '../db';
import { NotFoundError } from '../errors';
import { emptyState } from '../reviews/scheduler';
import { startOfNextDay } from '../time';
import type { Card, CardDetail, CardInput, CardStats, CardWithReviews, Origin } from './types';

export type CardsService = ReturnType<typeof createCardsService>;

const DIRECTIONS = ['fr_to_en', 'en_to_fr'] as const;

function clean({ french, english, context }: CardInput) {
	return { french: french.trim(), english: english.trim(), context: context?.trim() || null };
}

/** Clé de comparaison des doublons : casse et espaces ignorés. */
function duplicateKey(text: string): string {
	return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function createCardsService(db: Db) {
	async function findOwned(ownerId: string, id: string): Promise<Card> {
		const card = await db.card.findFirst({ where: { id, ownerId, deletedAt: null } });
		if (!card) throw new NotFoundError(`Card ${id} not found`);
		return card;
	}

	return {
		/** Crée la carte et ses deux révisions, dues immédiatement. */
		create(
			ownerId: string,
			input: CardInput,
			origin: Origin,
			now = new Date()
		): Promise<CardWithReviews> {
			return db.card.create({
				data: {
					...clean(input),
					origin,
					ownerId,
					reviews: {
						create: DIRECTIONS.map((direction) => ({ direction, ...emptyState(now) }))
					}
				},
				include: { reviews: true }
			});
		},

		/** Cartes non supprimées ayant le même anglais (casse et espaces ignorés). */
		async findDuplicates(
			ownerId: string,
			english: string,
			{ excludeId }: { excludeId?: string } = {}
		): Promise<Card[]> {
			const key = duplicateKey(english);
			const candidates = await db.card.findMany({
				where: { ownerId, deletedAt: null, ...(excludeId && { id: { not: excludeId } }) },
				orderBy: { createdAt: 'desc' }
			});
			return candidates.filter((card) => duplicateKey(card.english) === key);
		},

		list(ownerId: string, { query }: { query?: string } = {}): Promise<CardWithReviews[]> {
			const q = query?.trim();
			return db.card.findMany({
				where: {
					ownerId,
					deletedAt: null,
					...(q && {
						OR: [
							{ french: { contains: q, mode: 'insensitive' } },
							{ english: { contains: q, mode: 'insensitive' } },
							{ context: { contains: q, mode: 'insensitive' } }
						]
					})
				},
				include: { reviews: { orderBy: { direction: 'asc' } } },
				orderBy: { createdAt: 'desc' }
			});
		},

		async get(ownerId: string, id: string): Promise<CardDetail> {
			const card = await db.card.findFirst({
				where: { id, ownerId, deletedAt: null },
				include: {
					reviews: {
						orderBy: { direction: 'asc' },
						include: { logs: { orderBy: { reviewedAt: 'desc' } } }
					}
				}
			});
			if (!card) throw new NotFoundError(`Card ${id} not found`);
			return card;
		},

		/**
		 * Modifier le français ou l'anglais réinitialise la progression des deux sens
		 * (l'historique est conservé) ; modifier seulement le contexte n'y touche pas.
		 */
		async update(
			ownerId: string,
			id: string,
			input: CardInput,
			now = new Date()
		): Promise<{ card: Card; progressReset: boolean }> {
			const existing = await findOwned(ownerId, id);
			const data = clean(input);
			const progressReset = data.french !== existing.french || data.english !== existing.english;

			const [card] = await db.$transaction([
				db.card.update({ where: { id }, data }),
				...(progressReset
					? [
							db.review.updateMany({
								where: { cardId: id },
								data: { ...emptyState(now), hintRequestedAt: null }
							})
						]
					: [])
			]);
			return { card, progressReset };
		},

		/** Suppression logique, idempotente : supprimer une carte déjà supprimée réussit. */
		async softDelete(ownerId: string, id: string): Promise<void> {
			const existing = await db.card.findFirst({ where: { id, ownerId } });
			if (!existing) throw new NotFoundError(`Card ${id} not found`);
			if (existing.deletedAt) return;
			await db.card.update({ where: { id }, data: { deletedAt: new Date() } });
		},

		async stats(ownerId: string, now = new Date()): Promise<CardStats> {
			const [totalCards, dueToday] = await Promise.all([
				db.card.count({ where: { ownerId, deletedAt: null } }),
				db.review.count({
					where: { due: { lt: startOfNextDay(now) }, card: { ownerId, deletedAt: null } }
				})
			]);
			return { totalCards, dueToday };
		}
	};
}
