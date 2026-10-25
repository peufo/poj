import { createCardsService, type CardInput, type Db, type Origin } from '../domain/index';

/** Utilisateur sans mot de passe, `prénom@test.dev`. Renvoie son id. */
export async function createUser(db: Db, name: string): Promise<string> {
	const user = await db.user.create({ data: { name, email: `${name.toLowerCase()}@test.dev` } });
	return user.id;
}

/** Carte créée par le service (deux révisions neuves), `a` / `a` par défaut. */
export function createCard(
	db: Db,
	ownerId: string,
	{
		origin = 'web',
		now = new Date(),
		...input
	}: Partial<CardInput> & { origin?: Origin; now?: Date } = {}
) {
	return createCardsService(db).create(
		ownerId,
		{ french: 'a', english: 'a', ...input },
		origin,
		now
	);
}
