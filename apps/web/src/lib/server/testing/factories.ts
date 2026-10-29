import {
	createCardsService,
	DEFAULT_DECK,
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

/**
 * Deck du propriétaire, le deck par défaut (« Français → Anglais ») sauf mention contraire.
 * Pour un sujet, passer `kind: 'subject', languageA: null, languageB: null`.
 */
export function createDeck(
	db: Db,
	ownerId: string,
	overrides: Partial<Omit<Deck, 'id' | 'ownerId'>> = {}
): Promise<Deck> {
	return db.deck.create({ data: { ...DEFAULT_DECK, ...overrides, ownerId } });
}

/** Carte créée par le service (révisions neuves, deck par défaut), `a` / `a` par défaut. */
export function createCard(
	db: Db,
	ownerId: string,
	{
		origin = 'web',
		now = new Date(),
		...input
	}: Partial<CardInput> & { origin?: Origin; now?: Date } = {}
) {
	return createCardsService(db).create(ownerId, { sideA: 'a', sideB: 'a', ...input }, origin, now);
}
