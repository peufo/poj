import type { Db } from '../db';
import { directionsOf, findOwnedDeck, lockOwner, reviewedDirections } from '../decks/decks.service';
import type { Deck } from '../decks/types';
import { NotFoundError } from '../errors';
import { comparisonKey } from '../text';
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

/** Fenêtre pendant laquelle `createOnce` renvoie une carte identique au lieu d'en créer une. */
const REPLAY_WINDOW_MS = 10 * 60 * 1000;

function clean({ sideA, sideB, context }: CardInput) {
	return { sideA: sideA.trim(), sideB: sideB.trim(), context: context?.trim() || null };
}

/** Modifier l'une des deux faces (après nettoyage) réinitialise la progression. */
export function resetsProgress(existing: Pick<Card, 'sideA' | 'sideB'>, input: CardInput): boolean {
	const data = clean(input);
	return data.sideA !== existing.sideA || data.sideB !== existing.sideB;
}

/**
 * Face qui identifie une carte pour les doublons : la langue apprise (B) pour une langue,
 * la question (A) pour un sujet.
 */
export function duplicateSide(deck: Pick<Deck, 'kind'>): 'sideA' | 'sideB' {
	return deck.kind === 'language' ? 'sideB' : 'sideA';
}

/** Révisions neuves d'une carte, dues immédiatement, pour chaque sens révisé du deck. */
const newReviews = (deck: Deck, now: Date) => ({
	create: directionsOf(deck).map((direction) => ({ direction, ...emptyState(now) }))
});

export function createCardsService(db: Db) {
	async function findOwned(ownerId: string, id: string): Promise<Card> {
		const card = await db.card.findFirst({ where: { id, ownerId, deletedAt: null } });
		if (!card) throw new NotFoundError(`Card ${id} not found`);
		return card;
	}

	/**
	 * Les révisions des sens révisés des cartes non supprimées (du deck `deckId` s'il est
	 * précisé), de quoi calculer leur présentation.
	 */
	function reviewSlots(ownerId: string, deckId?: string) {
		return db.review.findMany({
			where: { card: { ownerId, deletedAt: null, deckId }, ...reviewedDirections },
			select: { id: true, cardId: true, direction: true, due: true, lastReview: true }
		});
	}

	return {
		/**
		 * Crée la carte dans le deck `deckId` du propriétaire (`NotFoundError` sinon), avec une
		 * révision neuve par sens révisé (les deux, ou `a_to_b` seul pour un deck à sens
		 * unique), due immédiatement.
		 */
		create(
			ownerId: string,
			deckId: string,
			input: CardInput,
			origin: Origin,
			now = new Date()
		): Promise<CardWithReviews> {
			return db.$transaction(async (tx) => {
				await lockOwner(tx, ownerId);
				const deck = await findOwnedDeck(tx, ownerId, deckId);
				return tx.card.create({
					data: {
						...clean(input),
						origin,
						ownerId,
						deckId: deck.id,
						reviews: newReviews(deck, now)
					},
					include: { deck: true, reviews: true }
				});
			});
		},

		/**
		 * Comme `create`, mais rejouable : si une carte identique (mêmes trois champs, après
		 * nettoyage) a été créée dans les 10 dernières minutes, la renvoie sans en créer une
		 * seconde. Protège contre les relances réseau des clients sans identifiant (MCP).
		 */
		createOnce(
			ownerId: string,
			deckId: string,
			input: CardInput,
			origin: Origin,
			now = new Date()
		): Promise<{ card: CardWithReviews; created: boolean }> {
			const data = clean(input);
			return db.$transaction(async (tx) => {
				// Sérialise les créations d'un même propriétaire : deux relances simultanées
				// ne peuvent pas passer toutes les deux la recherche.
				await lockOwner(tx, ownerId);
				const deck = await findOwnedDeck(tx, ownerId, deckId);
				const existing = await tx.card.findFirst({
					where: {
						...data,
						ownerId,
						deckId: deck.id,
						deletedAt: null,
						createdAt: { gte: new Date(now.getTime() - REPLAY_WINDOW_MS) }
					},
					include: { deck: true, reviews: true },
					orderBy: { createdAt: 'desc' }
				});
				if (existing) return { card: existing, created: false };

				const card = await tx.card.create({
					data: {
						...data,
						origin,
						ownerId,
						deckId: deck.id,
						// Horodatée avec `now` pour que la fenêtre de rejeu suive la même horloge.
						createdAt: now,
						reviews: newReviews(deck, now)
					},
					include: { deck: true, reviews: true }
				});
				return { card, created: true };
			});
		},

		/**
		 * Cartes non supprimées du même deck dont la face qui identifie une carte
		 * (`duplicateSide`) est la même que celle de `input` (casse et espaces ignorés).
		 */
		async findDuplicates(
			ownerId: string,
			deck: Pick<Deck, 'id' | 'kind'>,
			input: Pick<CardInput, 'sideA' | 'sideB'>,
			{ excludeId }: { excludeId?: string } = {}
		): Promise<Card[]> {
			const side = duplicateSide(deck);
			const key = comparisonKey(input[side]);
			const candidates = await db.card.findMany({
				where: {
					ownerId,
					deckId: deck.id,
					deletedAt: null,
					...(excludeId && { id: { not: excludeId } })
				},
				orderBy: { createdAt: 'desc' }
			});
			return candidates.filter((card) => comparisonKey(card[side]) === key);
		},

		/**
		 * Cartes non supprimées (du deck `deckId` s'il est précisé), des plus récentes aux plus
		 * anciennes, avec les révisions de leurs sens révisés. La recherche porte sur les deux
		 * faces et le contexte, sans tenir compte de la casse ni des accents (extension
		 * `unaccent`) ; `%` et `_` s'y cherchent tels quels.
		 */
		async list(
			ownerId: string,
			{ query, deckId }: { query?: string; deckId?: string } = {}
		): Promise<CardWithReviews[]> {
			const q = query?.trim();
			let ids: string[] | undefined;
			if (q) {
				const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
				const rows = await db.$queryRaw<{ id: string }[]>`
					SELECT id FROM cards
					WHERE owner_id = ${ownerId}::uuid AND deleted_at IS NULL AND (
						unaccent(side_a) ILIKE unaccent(${pattern})
						OR unaccent(side_b) ILIKE unaccent(${pattern})
						OR unaccent(context) ILIKE unaccent(${pattern})
					)`;
				if (rows.length === 0) return [];
				ids = rows.map((row) => row.id);
			}
			return db.card.findMany({
				where: { ownerId, deletedAt: null, deckId, ...(ids && { id: { in: ids } }) },
				include: {
					deck: true,
					reviews: { where: reviewedDirections, orderBy: { direction: 'asc' } }
				},
				orderBy: { createdAt: 'desc' }
			});
		},

		async get(ownerId: string, id: string): Promise<CardDetail> {
			const card = await db.card.findFirst({
				where: { id, ownerId, deletedAt: null },
				include: {
					deck: true,
					reviews: {
						where: reviewedDirections,
						orderBy: { direction: 'asc' },
						include: { logs: { orderBy: { reviewedAt: 'desc' } } }
					}
				}
			});
			if (!card) throw new NotFoundError(`Card ${id} not found`);
			return card;
		},

		/**
		 * Modifier l'une des faces réinitialise la progression de tous les sens
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
		 * carte quand les deux viendraient aujourd'hui (voir `presentations`). Tous les decks,
		 * ou le deck `deckId`.
		 */
		async stats(
			ownerId: string,
			now = new Date(),
			{ deckId }: { deckId?: string } = {}
		): Promise<CardStats> {
			const [totalCards, slots] = await Promise.all([
				db.card.count({ where: { ownerId, deletedAt: null, deckId } }),
				reviewSlots(ownerId, deckId)
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
		 * côté compte au jour où sa mise de côté se termine, comme dans `stats`. Tous les decks,
		 * ou le deck `deckId`.
		 */
		async horizon(
			ownerId: string,
			now = new Date(),
			days = 14,
			{ deckId }: { deckId?: string } = {}
		): Promise<HorizonDay[]> {
			const slots = await reviewSlots(ownerId, deckId);
			const end = startOfDay(now, days).getTime();
			const counts = Array.from({ length: days }, () => 0);
			for (const { at } of presentations(slots, now).values()) {
				if (at.getTime() < end) counts[Math.max(0, calendarDaysBetween(now, at))] += 1;
			}
			return counts.map((count, i) => ({ date: startOfDay(now, i), count }));
		}
	};
}
