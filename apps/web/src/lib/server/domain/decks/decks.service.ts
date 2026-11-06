// Decks (doc/story/decks.md) : chaque carte appartient à un deck de son propriétaire. Il n'y
// a pas de deck par défaut : un deck se crée toujours explicitement.
import { languageDeckName } from '../../../format/decks';
import type { Prisma } from '../../db/generated/prisma/client';
import type { Db, Tx } from '../db';
import { ConflictError, NotFoundError } from '../errors';
import { limitHistory, limitOn } from '../reviews/new-cards';
import { emptyState } from '../reviews/scheduler';
import { startOfDay } from '../time';
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

/**
 * Deck de ce nom parmi `decks`, casse et espaces ignorés. C'est la seule comparaison des
 * noms de deck : unicité à l'enregistrement, et nom passé par Claude, souvent dicté.
 */
export function findDeckByName<T extends Pick<Deck, 'name'>>(
	decks: readonly T[],
	name: string
): T | undefined {
	const key = comparisonKey(name);
	return decks.find((deck) => comparisonKey(deck.name) === key);
}

/**
 * Nom enregistré d'un deck : sa langue apprise pour un deck de langue (« Finnois »), le nom
 * saisi pour un sujet. Appliqué à la création comme à chaque modification : le nom d'une
 * langue suit sa langue apprise, et deux decks de même langue apprise sont refusés comme
 * deux noms identiques.
 */
export function deckName(deck: Pick<Deck, 'kind' | 'languageB'> & { name?: string }): string {
	return deck.kind === 'language' && deck.languageB
		? languageDeckName(deck.languageB)
		: (deck.name ?? '').trim();
}

/** Deck demandé par son id (page web, `?deck=`) ou par son nom (Claude). */
export type DeckRequest = { id: string } | { name: string };

/**
 * Deck retenu parmi ceux de l'utilisateur :
 * - `none` : il n'a aucun deck, qu'un deck soit demandé ou non ;
 * - `unknown` : le deck demandé (`request`) n'est pas à lui ;
 * - `several` : aucun deck demandé, et il en a plusieurs ;
 * - `found` : le deck demandé, ou son seul deck.
 */
export type DeckChoice<T, R extends DeckRequest = DeckRequest> =
	| { status: 'none' }
	| { status: 'unknown'; request: R }
	| { status: 'several' }
	| { status: 'found'; deck: T };

/**
 * Deck d'une action parmi les decks de l'utilisateur : celui demandé, sinon son seul deck.
 * Chaque appelant décide de ce que valent les autres cas.
 */
export function resolveDeck<T extends Pick<Deck, 'id' | 'name'>, R extends DeckRequest>(
	decks: readonly T[],
	request?: R
): DeckChoice<T, R> {
	if (decks.length === 0) return { status: 'none' };
	if (request === undefined) {
		const [only] = decks;
		return decks.length === 1 && only ? { status: 'found', deck: only } : { status: 'several' };
	}
	const deck =
		'id' in request ? decks.find((d) => d.id === request.id) : findDeckByName(decks, request.name);
	return deck ? { status: 'found', deck } : { status: 'unknown', request };
}

/** Refuse un nom déjà porté par un autre deck non supprimé du propriétaire. */
async function assertNameFree(tx: Tx, ownerId: string, name: string, excludeId?: string) {
	const others = await tx.deck.findMany({
		where: { ownerId, deletedAt: null, ...(excludeId && { id: { not: excludeId } }) },
		select: { name: true }
	});
	if (findDeckByName(others, name)) {
		throw new ConflictError(`Deck name "${name}" is already taken`);
	}
}

/**
 * Limite de nouvelles cartes par jour du deck, dès aujourd'hui : un second changement le
 * même jour remplace le premier, et une limite inchangée n'ajoute rien à l'historique.
 */
async function setNewCardsPerDay(tx: Tx, deckId: string, perDay: number, now: Date) {
	const effectiveFrom = startOfDay(now);
	const history = await tx.newCardsLimit.findMany({ where: { deckId }, ...limitHistory });
	if (limitOn(history, effectiveFrom) === perDay) return;
	await tx.newCardsLimit.upsert({
		where: { deckId_effectiveFrom: { deckId, effectiveFrom } },
		create: { deckId, perDay, effectiveFrom },
		update: { perDay }
	});
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

		/** Limite de nouvelles cartes par jour du deck, en vigueur aujourd'hui. */
		async newCardsPerDay(ownerId: string, id: string, now = new Date()): Promise<number> {
			const deck = await db.deck.findFirst({
				where: { id, ownerId, deletedAt: null },
				select: { newCardsLimits: limitHistory }
			});
			if (!deck) throw new NotFoundError(`Deck ${id} not found`);
			return limitOn(deck.newCardsLimits, startOfDay(now));
		},

		/**
		 * Crée un deck, nommé par `deckName`. Un nom déjà pris (casse et espaces ignorés), donc
		 * aussi une langue apprise déjà prise, donne une `ConflictError`.
		 */
		create(ownerId: string, input: DeckInput): Promise<Deck> {
			const data = { ...input, name: deckName(input) };
			return db.$transaction(async (tx) => {
				await lockOwner(tx, ownerId);
				await assertNameFree(tx, ownerId, data.name);
				return tx.deck.create({ data: { ...data, ownerId } });
			});
		},

		/**
		 * Modifie le nom et les libellés d'un sujet (laissés tels quels s'ils sont absents) et
		 * l'option des deux sens ; le type et les langues ne changent pas, et une langue garde
		 * le nom de sa langue apprise (`deckName`) sans libellés. Activer
		 * les deux sens crée les révisions `b_to_a` manquantes, dues immédiatement ; le
		 * désactiver ne supprime rien. Une nouvelle limite de nouvelles cartes par jour
		 * s'applique dès aujourd'hui (`limitOn`).
		 */
		update(ownerId: string, id: string, input: DeckUpdate, now = new Date()): Promise<Deck> {
			return db.$transaction(async (tx) => {
				await lockOwner(tx, ownerId);
				const existing = await findOwnedDeck(tx, ownerId, id);
				// Une langue nomme ses faces d'après ses langues : pas de libellés.
				const { labelA, labelB, newCardsPerDay, ...rest } = input;
				const labels = existing.kind === 'subject' ? { labelA, labelB } : {};
				const name = deckName({ ...existing, name: input.name ?? existing.name });
				const data = { ...rest, ...labels, name };
				// Un nom inchangé (casse et espaces ignorés) est déjà unique.
				if (comparisonKey(name) !== comparisonKey(existing.name)) {
					await assertNameFree(tx, ownerId, name, id);
				}
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
				if (newCardsPerDay !== undefined) {
					await setNewCardsPerDay(tx, id, newCardsPerDay, now);
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
