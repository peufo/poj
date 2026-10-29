// Decks (doc/decisions.md, 2026-10-29) : tant qu'il n'y a pas d'interface multi-decks,
// chaque carte va dans le deck par défaut, créé à la volée au premier besoin.
import type { Db, Tx } from '../db';
import { NotFoundError } from '../errors';
import type { Direction } from '../cards/types';
import type { Deck } from './types';

export type DecksService = ReturnType<typeof createDecksService>;

/** Deck créé pour un propriétaire qui n'en a aucun : la seule paire écrite en dur. */
export const DEFAULT_DECK = {
	name: 'Français → Anglais',
	kind: 'language',
	languageA: 'fr',
	languageB: 'en-GB',
	bothDirections: true
} as const satisfies Partial<Deck>;

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
 * Sérialise les créations d'un même propriétaire (deck par défaut, cartes rejouables) le
 * temps de la transaction. Le verrou est réentrant : le reprendre dans la même transaction
 * ne bloque pas.
 */
export function lockOwner(tx: Tx, ownerId: string) {
	return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}::text))`;
}

/**
 * Deck d'une nouvelle carte, dans une transaction qui tient déjà `lockOwner` : le deck
 * demandé s'il appartient au propriétaire, sinon le deck par défaut (le plus ancien non
 * supprimé, créé s'il n'y en a aucun).
 */
export async function resolveDeck(tx: Tx, ownerId: string, deckId?: string): Promise<Deck> {
	if (deckId) {
		const deck = await tx.deck.findFirst({ where: { id: deckId, ownerId, deletedAt: null } });
		if (!deck) throw new NotFoundError(`Deck ${deckId} not found`);
		return deck;
	}
	return (await findDefault(tx, ownerId)) ?? tx.deck.create({ data: { ...DEFAULT_DECK, ownerId } });
}

/** Le deck par défaut existant : le plus ancien non supprimé. */
function findDefault(db: Db | Tx, ownerId: string): Promise<Deck | null> {
	return db.deck.findFirst({
		where: { ownerId, deletedAt: null },
		orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
	});
}

export function createDecksService(db: Db) {
	return {
		/**
		 * Le deck par défaut du propriétaire, créé s'il n'en a aucun. Idempotent. Une simple
		 * lecture quand il existe : le verrou n'est pris que pour le créer.
		 */
		async ensureDefault(ownerId: string): Promise<Deck> {
			return (
				(await findDefault(db, ownerId)) ??
				db.$transaction(async (tx) => {
					await lockOwner(tx, ownerId);
					return resolveDeck(tx, ownerId);
				})
			);
		}
	};
}
