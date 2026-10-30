// Decks (doc/story/decks.md) : chaque carte appartient à un deck de son propriétaire. Il n'y
// a pas de deck par défaut : un deck se crée toujours explicitement.
import type { Prisma } from '../../db/generated/prisma/client';
import type { Db, Tx } from '../db';
import { ConflictError, NotFoundError } from '../errors';
import { emptyState } from '../reviews/scheduler';
import { comparisonKey } from '../text';
import type { Direction } from '../cards/types';
import type { Deck, DeckInput, DeckUpdate, DeckWithCount } from './types';

export type DecksService = ReturnType<typeof createDecksService>;

/** Paire de langues d'un deck de langue (étiquettes BCP 47). */
export interface LanguagePair {
	languageA: string;
	languageB: string;
}

/**
 * Paire de langues du deck, ou `null` pour un sujet : DeepL ne donne un second avis que
 * sur un deck de langue.
 */
export function languagePair(
	deck: Pick<Deck, 'kind' | 'languageA' | 'languageB'>
): LanguagePair | null {
	const { kind, languageA, languageB } = deck;
	return kind === 'language' && languageA && languageB ? { languageA, languageB } : null;
}

/** Sens révisés pour une carte du deck : `a_to_b` seul si le deck est à sens unique. */
export function directionsOf(deck: Pick<Deck, 'bothDirections'>): Direction[] {
	return deck.bothDirections ? ['a_to_b', 'b_to_a'] : ['a_to_b'];
}

/**
 * Filtre des révisions d'un sens révisé : `a_to_b`, ou `b_to_a` dans un deck qui révise
 * les deux sens. Un deck passé à sens unique garde ses `b_to_a`, qui ne sont plus
 * présentées ni comptées.
 */
export const reviewedDirections = {
	OR: [{ direction: 'a_to_b' }, { card: { deck: { bothDirections: true } } }]
} satisfies Prisma.ReviewWhereInput;

/**
 * Sérialise les créations d'un même propriétaire (decks, cartes rejouables) le temps de la
 * transaction. Le verrou est réentrant : le reprendre dans la même transaction ne bloque pas.
 */
export function lockOwner(tx: Tx, ownerId: string) {
	return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}::text))`;
}

/** Deck non supprimé du propriétaire, sinon `NotFoundError`. */
export async function findOwnedDeck(db: Db | Tx, ownerId: string, id: string): Promise<Deck> {
	const deck = await db.deck.findFirst({ where: { id, ownerId, deletedAt: null } });
	if (!deck) throw new NotFoundError(`Deck ${id} not found`);
	return deck;
}

/** Refuse un nom déjà porté par un autre deck non supprimé du propriétaire. */
async function assertNameFree(tx: Tx, ownerId: string, name: string, excludeId?: string) {
	const others = await tx.deck.findMany({
		where: { ownerId, deletedAt: null, ...(excludeId && { id: { not: excludeId } }) },
		select: { name: true }
	});
	if (others.some((other) => comparisonKey(other.name) === comparisonKey(name))) {
		throw new ConflictError(`Deck name "${name}" is already taken`);
	}
}

export function createDecksService(db: Db) {
	return {
		/** Decks non supprimés, du plus ancien au plus récent, avec leur nombre de cartes. */
		async list(ownerId: string): Promise<DeckWithCount[]> {
			const decks = await db.deck.findMany({
				where: { ownerId, deletedAt: null },
				orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
				include: { _count: { select: { cards: { where: { deletedAt: null } } } } }
			});
			return decks.map(({ _count, ...deck }) => ({ ...deck, cardCount: _count.cards }));
		},

		get(ownerId: string, id: string): Promise<Deck> {
			return findOwnedDeck(db, ownerId, id);
		},

		/**
		 * Le plus ancien deck non supprimé, ou `null` : celui des cartes capturées par Claude
		 * tant qu'il ne choisit pas le deck (T-0005).
		 */
		first(ownerId: string): Promise<Deck | null> {
			return db.deck.findFirst({
				where: { ownerId, deletedAt: null },
				orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
			});
		},

		/** Crée un deck. Un nom déjà pris (casse et espaces ignorés) donne une `ConflictError`. */
		create(ownerId: string, input: DeckInput): Promise<Deck> {
			const data = { ...input, name: input.name.trim() };
			return db.$transaction(async (tx) => {
				await lockOwner(tx, ownerId);
				await assertNameFree(tx, ownerId, data.name);
				return tx.deck.create({ data: { ...data, ownerId } });
			});
		},

		/**
		 * Modifie le nom, les libellés (laissés tels quels s'ils sont absents) et l'option des
		 * deux sens ; le type et les langues ne changent pas. Activer les deux sens crée les
		 * révisions `b_to_a` manquantes, dues immédiatement ; le désactiver ne supprime rien.
		 */
		update(ownerId: string, id: string, input: DeckUpdate, now = new Date()): Promise<Deck> {
			const data = { ...input, name: input.name.trim() };
			return db.$transaction(async (tx) => {
				await lockOwner(tx, ownerId);
				const existing = await findOwnedDeck(tx, ownerId, id);
				await assertNameFree(tx, ownerId, data.name, id);
				if (data.bothDirections && !existing.bothDirections) {
					const missing = await tx.card.findMany({
						where: { deckId: id, reviews: { none: { direction: 'b_to_a' } } },
						select: { id: true }
					});
					// `skipDuplicates` : une `b_to_a` créée entre-temps n'est pas dupliquée.
					await tx.review.createMany({
						data: missing.map((card) => ({
							cardId: card.id,
							direction: 'b_to_a' as const,
							...emptyState(now)
						})),
						skipDuplicates: true
					});
				}
				return tx.deck.update({ where: { id }, data });
			});
		},

		/**
		 * Suppression logique du deck et de ses cartes, idempotente : supprimer un deck déjà
		 * supprimé réussit. Le dernier deck se supprime aussi : l'utilisateur repart alors de
		 * la création du premier.
		 */
		softDelete(ownerId: string, id: string, now = new Date()): Promise<void> {
			return db.$transaction(async (tx) => {
				// Le verrou écarte une carte créée dans le deck pendant sa suppression.
				await lockOwner(tx, ownerId);
				const existing = await tx.deck.findFirst({ where: { id, ownerId } });
				if (!existing) throw new NotFoundError(`Deck ${id} not found`);
				if (existing.deletedAt) return;
				await tx.card.updateMany({
					where: { deckId: id, deletedAt: null },
					data: { deletedAt: now }
				});
				await tx.deck.update({ where: { id }, data: { deletedAt: now } });
			});
		}
	};
}
