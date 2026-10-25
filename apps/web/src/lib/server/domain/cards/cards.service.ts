import type { Db } from '../db';
import { NotFoundError } from '../errors';
import { emptyState } from '../reviews/scheduler';
import { calendarDaysBetween, startOfDay, startOfNextDay } from '../time';
import type {
	Card,
	CardDetail,
	CardInput,
	CardStats,
	CardWithReviews,
	HorizonDay,
	Origin
} from './types';

export type CardsService = ReturnType<typeof createCardsService>;

const DIRECTIONS = ['fr_to_en', 'en_to_fr'] as const;

/** Fenêtre pendant laquelle `createOnce` renvoie une carte identique au lieu d'en créer une. */
const REPLAY_WINDOW_MS = 10 * 60 * 1000;

function clean({ french, english, context }: CardInput) {
	return { french: french.trim(), english: english.trim(), context: context?.trim() || null };
}

/** Clé de comparaison des doublons : casse et espaces ignorés. */
function duplicateKey(text: string): string {
	return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Modifier le français ou l'anglais (après nettoyage) réinitialise la progression. */
export function resetsProgress(
	existing: Pick<Card, 'french' | 'english'>,
	input: CardInput
): boolean {
	const data = clean(input);
	return data.french !== existing.french || data.english !== existing.english;
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

		/**
		 * Comme `create`, mais rejouable : si une carte identique (mêmes trois champs, après
		 * nettoyage) a été créée dans les 10 dernières minutes, la renvoie sans en créer une
		 * seconde. Protège contre les relances réseau des clients sans identifiant (MCP).
		 */
		createOnce(
			ownerId: string,
			input: CardInput,
			origin: Origin,
			now = new Date()
		): Promise<{ card: CardWithReviews; created: boolean }> {
			const data = clean(input);
			return db.$transaction(async (tx) => {
				// Sérialise les créations d'un même propriétaire : deux relances simultanées
				// ne peuvent pas passer toutes les deux la recherche.
				await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}::text))`;
				const existing = await tx.card.findFirst({
					where: {
						...data,
						ownerId,
						deletedAt: null,
						createdAt: { gte: new Date(now.getTime() - REPLAY_WINDOW_MS) }
					},
					include: { reviews: true },
					orderBy: { createdAt: 'desc' }
				});
				if (existing) return { card: existing, created: false };

				const card = await tx.card.create({
					data: {
						...data,
						origin,
						ownerId,
						// Horodatée avec `now` pour que la fenêtre de rejeu suive la même horloge.
						createdAt: now,
						reviews: {
							create: DIRECTIONS.map((direction) => ({ direction, ...emptyState(now) }))
						}
					},
					include: { reviews: true }
				});
				return { card, created: true };
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
			const progressReset = resetsProgress(existing, input);

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
		},

		/**
		 * Révisions dues sur les `days` prochains jours civils (Europe/Zurich), une entrée
		 * par jour à partir d'aujourd'hui ; le premier jour inclut le retard.
		 */
		async horizon(ownerId: string, now = new Date(), days = 14): Promise<HorizonDay[]> {
			const reviews = await db.review.findMany({
				where: { due: { lt: startOfDay(now, days) }, card: { ownerId, deletedAt: null } },
				select: { due: true }
			});
			const counts = Array.from({ length: days }, () => 0);
			for (const { due } of reviews) counts[Math.max(0, calendarDaysBetween(now, due))] += 1;
			return counts.map((count, i) => ({ date: startOfDay(now, i), count }));
		}
	};
}
