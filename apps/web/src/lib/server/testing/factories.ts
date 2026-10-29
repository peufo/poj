import {
	createCardsService,
	type CardInput,
	type Db,
	type Deck,
	type Origin,
	type UserRole
} from '../domain/index';

/** Utilisateur sans mot de passe, `prénom@test.dev`, testeur sauf mention. Renvoie son id. */
export async function createUser(
	db: Db,
	name: string,
	{ role = 'user' }: { role?: UserRole } = {}
): Promise<string> {
	const user = await db.user.create({
		data: { name, email: `${name.toLowerCase()}@test.dev`, role }
	});
	return user.id;
}

/** Deck de langue des tests et de la seed : français → anglais, révisé dans les deux sens. */
export const FR_EN_DECK = {
	name: 'Français → Anglais',
	kind: 'language',
	languageA: 'fr',
	languageB: 'en-GB',
	bothDirections: true
} as const satisfies Partial<Deck>;

/** Deck de sujet sans libellés (« Question » / « Réponse »), à sens unique. */
export const SUBJECT_DECK = {
	name: 'Sujet',
	kind: 'subject',
	languageA: null,
	languageB: null,
	bothDirections: false
} as const satisfies Partial<Deck>;

/**
 * Deck du propriétaire, `FR_EN_DECK` sauf mention contraire. Pour un sujet, partir de
 * `SUBJECT_DECK`.
 */
export function createDeck(
	db: Db,
	ownerId: string,
	overrides: Partial<Omit<Deck, 'id' | 'ownerId'>> = {}
): Promise<Deck> {
	return db.deck.create({ data: { ...FR_EN_DECK, ...overrides, ownerId } });
}

/**
 * Carte créée par le service (révisions neuves), `a` / `a` par défaut. Sans `deckId`, elle
 * va dans le plus ancien deck du propriétaire, créé (`FR_EN_DECK`) s'il n'en a aucun : une
 * commodité des tests, l'application ne crée jamais de deck implicitement.
 */
export async function createCard(
	db: Db,
	ownerId: string,
	{
		origin = 'web',
		now = new Date(),
		deckId,
		...input
	}: Partial<CardInput> & { origin?: Origin; now?: Date; deckId?: string } = {}
) {
	const deck =
		deckId ??
		(await db.deck.findFirst({ where: { ownerId }, orderBy: { createdAt: 'asc' } }))?.id ??
		(await createDeck(db, ownerId)).id;
	return createCardsService(db).create(
		ownerId,
		deck,
		{ sideA: 'a', sideB: 'a', ...input },
		origin,
		now
	);
}
