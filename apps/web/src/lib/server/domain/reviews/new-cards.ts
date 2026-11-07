// Limite de nouvelles cartes par jour et par deck (doc/specs/repetition.md, « Nouvelles
// cartes ») : une carte jamais répondue n'est présentée que dans la limite du jour de son
// deck. Au-delà, elle attend les jours suivants : c'est un stock, pas une dette.
import type { Prisma } from '../../db/generated/prisma/client';
import type { Db } from '../db';
import { startOfDay } from '../time';

/** Limite d'un deck tant que l'utilisateur ne l'a pas changée. */
export const DEFAULT_NEW_CARDS_PER_DAY = 10;
export const MIN_NEW_CARDS_PER_DAY = 1;
export const MAX_NEW_CARDS_PER_DAY = 100;

/** Un changement de limite, applicable à partir de `effectiveFrom` (minuit local). */
interface NewCardsLimitChange {
	perDay: number;
	effectiveFrom: Date;
}

/** Limite en vigueur le jour qui commence à `dayStart`. `changes` est trié par date. */
export function limitOn(changes: readonly NewCardsLimitChange[], dayStart: Date): number {
	let limit = DEFAULT_NEW_CARDS_PER_DAY;
	for (const change of changes) {
		if (change.effectiveFrom.getTime() > dayStart.getTime()) break;
		limit = change.perDay;
	}
	return limit;
}

/** Historique des limites d'un deck, du plus ancien changement au plus récent. */
export const limitHistory = {
	select: { perDay: true, effectiveFrom: true },
	orderBy: { effectiveFrom: 'asc' }
} as const satisfies Prisma.NewCardsLimitFindManyArgs;

/**
 * Carte déjà répondue, dans n'importe quel sens. Une carte réinitialisée (faces modifiées)
 * l'a été : elle n'est plus neuve et échappe à la limite.
 */
export const answeredCard = {
	reviews: { some: { logs: { some: {} } } }
} satisfies Prisma.CardWhereInput;

/** Cartes neuves réparties par la limite du jour de leur deck. */
export interface NewCards {
	/** Présentables aujourd'hui : dans ce qui reste de la limite du jour de leur deck. */
	released: string[];
	/** Au-delà : elles attendent les jours suivants. */
	held: string[];
	/**
	 * Jour où chaque carte en attente deviendra présentable (1 : demain), si la limite
	 * d'aujourd'hui de son deck reste la même et que chaque jour l'épuise.
	 */
	releaseDays: Map<string, number>;
}

/**
 * Répartit des cartes neuves, dans leur ordre de présentation : dans chaque deck, les
 * `quota(deck)` premières sont présentables, les autres attendent, et entrent ensuite par
 * `limit(deck)` chaque jour.
 */
export function splitNewCards(
	cards: readonly { id: string; deckId: string }[],
	quota: (deckId: string) => number,
	limit: (deckId: string) => number
): NewCards {
	const taken = new Map<string, number>();
	const result: NewCards = { released: [], held: [], releaseDays: new Map() };
	for (const { id, deckId } of cards) {
		const count = taken.get(deckId) ?? 0;
		const rank = count - Math.max(0, quota(deckId));
		if (rank < 0) {
			result.released.push(id);
		} else {
			result.held.push(id);
			result.releaseDays.set(id, Math.floor(rank / limit(deckId)) + 1);
		}
		taken.set(deckId, count + 1);
	}
	return result;
}

/**
 * Cartes neuves du propriétaire (du deck `deckId` s'il est précisé), réparties selon la
 * limite du jour civil (Europe/Zurich) de chaque deck. La limite compte des cartes : une
 * carte la consomme à sa première réponse, quel que soit le sens, et le second sens d'une
 * carte commencée n'y compte plus. Une carte commencée aujourd'hui puis supprimée la
 * consomme quand même.
 */
export async function findNewCards(
	db: Db,
	ownerId: string,
	now: Date,
	deckId?: string
): Promise<NewCards> {
	const today = startOfDay(now);
	const [pending, started, decks] = await Promise.all([
		db.card.findMany({
			where: { ownerId, deletedAt: null, deckId, NOT: answeredCard },
			select: { id: true, deckId: true },
			// Ordre de présentation : les plus anciennes d'abord.
			orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
		}),
		// Cartes dont la première réponse date d'aujourd'hui.
		db.card.groupBy({
			by: ['deckId'],
			where: {
				ownerId,
				deckId,
				AND: [
					{ reviews: { some: { logs: { some: { reviewedAt: { gte: today } } } } } },
					{ reviews: { none: { logs: { some: { reviewedAt: { lt: today } } } } } }
				]
			},
			_count: { _all: true }
		}),
		db.deck.findMany({
			where: { ownerId, id: deckId },
			select: { id: true, newCardsLimits: limitHistory }
		})
	]);

	const limits = new Map(decks.map((deck) => [deck.id, limitOn(deck.newCardsLimits, today)]));
	const limit = (id: string) => limits.get(id) ?? DEFAULT_NEW_CARDS_PER_DAY;
	const startedIn = new Map(started.map(({ deckId: id, _count }) => [id, _count._all]));
	return splitNewCards(pending, (id) => limit(id) - (startedIn.get(id) ?? 0), limit);
}

/** Filtre de carte : déjà répondue, ou neuve présentable aujourd'hui (`released`). */
export const presentableCard = ({ released }: Pick<NewCards, 'released'>) =>
	({ OR: [answeredCard, { id: { in: released } }] }) satisfies Prisma.CardWhereInput;
