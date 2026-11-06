import { at } from '../arrays';
import type { Db, Tx } from '../db';
import { directionsOf, findOwnedDeck, lockOwner, reviewedDirections } from '../decks/decks.service';
import type { Deck } from '../decks/types';
import { NotFoundError } from '../errors';
import { comparisonKey } from '../text';
import { presentations } from '../reviews/availability';
import { findNewCards, presentableCard } from '../reviews/new-cards';
import { emptyState } from '../reviews/scheduler';
import { calendarDaysBetween, startOfDay, startOfNextDay } from '../time';
import type {
	BatchEntry,
	BatchResult,
	Card,
	CardDetail,
	CardInput,
	CardStats,
	CardWithReviews,
	HorizonDay,
	Origin
} from './types';

export type CardsService = ReturnType<typeof createCardsService>;

/**
 * Fenêtre pendant laquelle `createOnce` renvoie une carte identique au lieu d'en créer une,
 * et `createBatch` la reconnaît comme déjà créée.
 */
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

/**
 * Révisions neuves d'une carte, dues immédiatement, pour chaque sens révisé du deck (la
 * présentation reste soumise à la limite de nouvelles cartes du deck).
 */
const newReviews = (deck: Deck, now: Date) => ({
	create: directionsOf(deck).map((direction) => ({ direction, ...emptyState(now) }))
});

/** Cartes non supprimées d'un deck, des plus récentes aux plus anciennes. */
function deckCards(db: Db | Tx, ownerId: string, deckId: string): Promise<Card[]> {
	return db.card.findMany({
		where: { ownerId, deckId, deletedAt: null },
		orderBy: { createdAt: 'desc' }
	});
}

/**
 * Classe chaque carte d'un lot, dans l'ordre : doublon d'une carte précédente du lot, carte
 * déjà créée (lot rejoué), doublon d'une carte du deck (`existing`), ou nouvelle.
 */
function classifyBatch(
	deck: Pick<Deck, 'kind'>,
	existing: readonly Card[],
	inputs: readonly CardInput[],
	now: Date
): BatchEntry[] {
	const side = duplicateSide(deck);
	const since = now.getTime() - REPLAY_WINDOW_MS;
	const byKey = Map.groupBy(existing, (card) => comparisonKey(card[side]));
	const seen = new Map<string, number>();
	return inputs.map((input, i): BatchEntry => {
		const data = clean(input);
		const key = comparisonKey(data[side]);
		const first = seen.get(key);
		if (first !== undefined) return { status: 'duplicate_in_batch', of: first };
		seen.set(key, i);

		const duplicates = byKey.get(key) ?? [];
		const replayed = duplicates.find(
			(card) =>
				card.sideA === data.sideA &&
				card.sideB === data.sideB &&
				card.context === data.context &&
				card.createdAt.getTime() >= since
		);
		if (replayed) return { status: 'existing', card: replayed };
		return duplicates.length > 0 ? { status: 'duplicate', duplicates } : { status: 'new' };
	});
}

export function createCardsService(db: Db) {
	async function findOwned(ownerId: string, id: string): Promise<Card> {
		const card = await db.card.findFirst({ where: { id, ownerId, deletedAt: null } });
		if (!card) throw new NotFoundError(`Card ${id} not found`);
		return card;
	}

	/**
	 * Les révisions des sens révisés des cartes non supprimées (du deck `deckId` s'il est
	 * précisé), de quoi calculer leur présentation. Les cartes neuves en attente (au-delà de
	 * la limite du jour de leur deck) n'en font pas partie.
	 */
	async function reviewSlots(ownerId: string, now: Date, deckId?: string) {
		const fresh = await findNewCards(db, ownerId, now, deckId);
		return db.review.findMany({
			where: {
				card: { ownerId, deletedAt: null, deckId, ...presentableCard(fresh) },
				...reviewedDirections
			},
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
		 * Classe chaque carte d'un lot destiné au deck, sans rien créer : doublons dans le lot
		 * ou dans le deck, cartes déjà créées (voir `createBatch`).
		 */
		async checkBatch(
			ownerId: string,
			deck: Pick<Deck, 'id' | 'kind'>,
			inputs: readonly CardInput[],
			now = new Date()
		): Promise<BatchEntry[]> {
			return classifyBatch(deck, await deckCards(db, ownerId, deck.id), inputs, now);
		},

		/**
		 * Crée un lot de cartes dans le deck `deckId` du propriétaire (`NotFoundError` sinon),
		 * comme `create`, sauf les doublons (dans le lot ou dans le deck) et les cartes déjà
		 * créées par le même lot dans les 10 dernières minutes : rejouer le lot ne crée rien de
		 * plus. Tout ou rien : une erreur n'en crée aucune. Les cartes sont horodatées dans
		 * l'ordre du lot (une milliseconde d'écart), qui devient leur ordre de présentation.
		 */
		createBatch(
			ownerId: string,
			deckId: string,
			inputs: readonly CardInput[],
			origin: Origin,
			now = new Date()
		): Promise<BatchResult[]> {
			return db.$transaction(async (tx) => {
				await lockOwner(tx, ownerId);
				const deck = await findOwnedDeck(tx, ownerId, deckId);
				const entries = classifyBatch(deck, await deckCards(tx, ownerId, deck.id), inputs, now);
				const fresh = entries.flatMap((entry, i) =>
					entry.status === 'new' ? [at(inputs, i)] : []
				);
				// Deux requêtes pour tout le lot, sous le verrou du propriétaire.
				const created = await tx.card.createManyAndReturn({
					data: fresh.map((input, k) => ({
						...clean(input),
						origin,
						ownerId,
						deckId: deck.id,
						createdAt: new Date(now.getTime() + k)
					}))
				});
				await tx.review.createMany({
					data: created.flatMap((card) =>
						newReviews(deck, now).create.map((review) => ({ ...review, cardId: card.id }))
					)
				});
				// Les horodatages, tous distincts, rendent à chaque carte sa place dans le lot.
				const byTime = new Map(created.map((card) => [card.createdAt.getTime(), card]));
				let k = 0;
				return entries.map((entry): BatchResult => {
					if (entry.status !== 'new') return entry;
					const card = byTime.get(now.getTime() + k++);
					if (!card) throw new Error('createBatch: a created card is missing from the batch');
					return { status: 'created', card };
				});
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
			const candidates = await deckCards(db, ownerId, deck.id);
			return candidates.filter(
				(card) => card.id !== excludeId && comparisonKey(card[side]) === key
			);
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
		 * carte quand les deux viendraient aujourd'hui (voir `presentations`), sans les cartes
		 * neuves en attente. Tous les decks, ou le deck `deckId`.
		 */
		async stats(
			ownerId: string,
			now = new Date(),
			{ deckId }: { deckId?: string } = {}
		): Promise<CardStats> {
			const [totalCards, slots] = await Promise.all([
				db.card.count({ where: { ownerId, deletedAt: null, deckId } }),
				reviewSlots(ownerId, now, deckId)
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
		 * côté compte au jour où sa mise de côté se termine, comme dans `stats`. Les cartes
		 * neuves en attente n'y figurent pas. Tous les decks, ou le deck `deckId`.
		 */
		async horizon(
			ownerId: string,
			now = new Date(),
			days = 14,
			{ deckId }: { deckId?: string } = {}
		): Promise<HorizonDay[]> {
			const slots = await reviewSlots(ownerId, now, deckId);
			const end = startOfDay(now, days).getTime();
			const counts = Array.from({ length: days }, () => 0);
			for (const { at: presentedAt } of presentations(slots, now).values()) {
				if (presentedAt.getTime() >= end) continue;
				const day = Math.max(0, calendarDaysBetween(now, presentedAt));
				counts[day] = at(counts, day) + 1;
			}
			return counts.map((count, i) => ({ date: startOfDay(now, i), count }));
		}
	};
}
