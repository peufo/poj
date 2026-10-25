import type { Db } from '../db';
import { NotFoundError } from '../errors';
import { presentations } from '../reviews/availability';
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

	/** Les révisions des cartes non supprimées, de quoi calculer leur présentation. */
	function reviewSlots(ownerId: string) {
		return db.review.findMany({
			where: { card: { ownerId, deletedAt: null } },
			select: { id: true, cardId: true, direction: true, due: true, lastReview: true }
		});
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

		/**
		 * Cartes non supprimées, des plus récentes aux plus anciennes. La recherche porte sur
		 * le français, l'anglais et le contexte, sans tenir compte de la casse ni des accents
		 * (extension `unaccent`) ; `%` et `_` s'y cherchent tels quels.
		 */
		async list(ownerId: string, { query }: { query?: string } = {}): Promise<CardWithReviews[]> {
			const q = query?.trim();
			let ids: string[] | undefined;
			if (q) {
				const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
				const rows = await db.$queryRaw<{ id: string }[]>`
					SELECT id FROM cards
					WHERE owner_id = ${ownerId}::uuid AND deleted_at IS NULL AND (
						unaccent(french) ILIKE unaccent(${pattern})
						OR unaccent(english) ILIKE unaccent(${pattern})
						OR unaccent(context) ILIKE unaccent(${pattern})
					)`;
				if (rows.length === 0) return [];
				ids = rows.map((row) => row.id);
			}
			return db.card.findMany({
				where: { ownerId, deletedAt: null, ...(ids && { id: { in: ids } }) },
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

		/**
		 * Nombre de cartes, et révisions qui seront présentées d'ici la fin du jour civil
		 * (Europe/Zurich) : sans les sens mis de côté jusqu'à demain, et au plus un sens par
		 * carte quand les deux viendraient aujourd'hui (voir `presentations`).
		 */
		async stats(ownerId: string, now = new Date()): Promise<CardStats> {
			const [totalCards, slots] = await Promise.all([
				db.card.count({ where: { ownerId, deletedAt: null } }),
				reviewSlots(ownerId)
			]);
			const endOfDay = startOfNextDay(now).getTime();
			let dueToday = 0;
			for (const { at } of presentations(slots, now).values()) {
				if (at.getTime() < endOfDay) dueToday += 1;
			}
			return { totalCards, dueToday };
		},

		/**
		 * Révisions présentées sur les `days` prochains jours civils (Europe/Zurich), une entrée
		 * par jour à partir d'aujourd'hui ; le premier jour inclut le retard. Un sens mis de
		 * côté compte au jour où sa mise de côté se termine, comme dans `stats`.
		 */
		async horizon(ownerId: string, now = new Date(), days = 14): Promise<HorizonDay[]> {
			const slots = await reviewSlots(ownerId);
			const end = startOfDay(now, days).getTime();
			const counts = Array.from({ length: days }, () => 0);
			for (const { at } of presentations(slots, now).values()) {
				if (at.getTime() < end) counts[Math.max(0, calendarDaysBetween(now, at))] += 1;
			}
			return counts.map((count, i) => ({ date: startOfDay(now, i), count }));
		}
	};
}
