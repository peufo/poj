import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../testing/db';
import {
	createCard,
	createDeck,
	createUser,
	FR_EN_DECK,
	SUBJECT_DECK
} from '../../testing/factories';
import {
	createDecksService,
	directionsOf,
	findDeckByName,
	languagePair,
	resolveDeck
} from './decks.service';
import { ConflictError, NotFoundError } from '../errors';

const db = useTestDatabase();
const decks = createDecksService(db);

const now = new Date('2026-01-05T08:00:00Z');

let alice: string;
let bob: string;

beforeEach(async () => {
	alice = await createUser(db, 'Alice');
	bob = await createUser(db, 'Bob');
});

const subject = { kind: 'subject', languageA: null, languageB: null } as const;

/** Nouveau deck de sujet « Pays » / « Capitale ». */
const capitals = {
	name: 'Capitales',
	kind: 'subject',
	languageA: null,
	languageB: null,
	labelA: 'Pays',
	labelB: 'Capitale',
	bothDirections: false
} as const;

describe('decks service', () => {
	it('creates no deck implicitly: a new owner has none', async () => {
		expect(await decks.list(alice)).toEqual([]);
		expect(await db.deck.count()).toBe(0);
	});

	it('lists the owner’s decks, oldest first, with their cards not deleted', async () => {
		const english = await createDeck(db, alice, { createdAt: new Date('2026-01-01') });
		const other = await createDeck(db, alice, {
			...SUBJECT_DECK,
			createdAt: new Date('2026-02-01')
		});
		await createDeck(db, alice, { name: 'Supprimé', deletedAt: new Date() });
		await createDeck(db, bob);
		await createCard(db, alice, { deckId: english.id });
		const deleted = await createCard(db, alice, { deckId: english.id });
		await db.card.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

		const listed = await decks.list(alice);
		expect(listed.map((d) => [d.id, d.cardCount])).toEqual([
			[english.id, 1],
			[other.id, 0]
		]);
		expect(listed[0]).toMatchObject({ ...FR_EN_DECK, ownerId: alice });
	});

	it('gets a deck of the owner only', async () => {
		const mine = await createDeck(db, alice);
		const theirs = await createDeck(db, bob);
		const deleted = await createDeck(db, alice, { name: 'x', deletedAt: new Date() });

		expect((await decks.get(alice, mine.id)).id).toBe(mine.id);
		await expect(decks.get(alice, theirs.id)).rejects.toBeInstanceOf(NotFoundError);
		await expect(decks.get(alice, deleted.id)).rejects.toBeInstanceOf(NotFoundError);
	});

	it('creates a language or subject deck, refusing a name already taken', async () => {
		const english = await decks.create(alice, {
			...FR_EN_DECK,
			name: '  Anglais ',
			labelA: null,
			labelB: null
		});
		const created = await decks.create(alice, capitals);

		expect(english).toMatchObject({ name: 'Anglais', kind: 'language', ownerId: alice });
		expect(english.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
		expect(created).toMatchObject(capitals);
		await expect(decks.create(alice, { ...capitals, name: 'CAPITALES' })).rejects.toBeInstanceOf(
			ConflictError
		);
		// Un autre propriétaire, ou un deck supprimé, ne bloque pas le nom.
		await expect(decks.create(bob, capitals)).resolves.toMatchObject({ ownerId: bob });
		await db.deck.update({ where: { id: created.id }, data: { deletedAt: new Date() } });
		await expect(decks.create(alice, capitals)).resolves.toMatchObject({ name: 'Capitales' });
	});

	it('updates name, labels and directions, but not the kind nor the languages', async () => {
		const deck = await decks.create(alice, capitals);
		await decks.create(alice, { ...capitals, name: 'Autre' });

		const updated = await decks.update(alice, deck.id, {
			name: 'Pays du monde',
			labelA: 'État',
			bothDirections: false
		});
		expect(updated).toMatchObject({ ...capitals, name: 'Pays du monde', labelA: 'État' });
		await expect(
			decks.update(alice, deck.id, { name: 'autre', bothDirections: false })
		).rejects.toBeInstanceOf(ConflictError);
		await expect(
			decks.update(bob, deck.id, { name: 'x', bothDirections: false })
		).rejects.toBeInstanceOf(NotFoundError);
		// Garder son propre nom n'est pas un conflit.
		await expect(
			decks.update(alice, deck.id, { name: 'Pays du monde', bothDirections: false })
		).resolves.toMatchObject({ name: 'Pays du monde' });
	});

	it('keeps a language deck without labels', async () => {
		const deck = await createDeck(db, alice, FR_EN_DECK);

		const updated = await decks.update(alice, deck.id, {
			name: 'Anglais',
			labelA: 'Question',
			labelB: 'Réponse',
			bothDirections: true
		});
		expect(updated).toMatchObject({ name: 'Anglais', labelA: null, labelB: null });
	});

	it('adds the missing b_to_a reviews, due now, when both directions are turned on', async () => {
		const deck = await decks.create(alice, capitals);
		const card = await createCard(db, alice, { deckId: deck.id, now });
		const later = new Date('2026-01-06T08:00:00Z');

		await decks.update(alice, deck.id, { name: 'Capitales', bothDirections: true }, later);
		await decks.update(alice, deck.id, { name: 'Capitales', bothDirections: false }, later);
		await decks.update(alice, deck.id, { name: 'Capitales', bothDirections: true }, later);

		const reviews = await db.review.findMany({
			where: { cardId: card.id },
			orderBy: { direction: 'asc' }
		});
		expect(reviews.map((r) => r.direction)).toEqual(['a_to_b', 'b_to_a']);
		expect(reviews[1]).toMatchObject({ state: 'new', due: later, reps: 0 });
	});

	it('soft-deletes a deck and its cards, idempotently, the last one included', async () => {
		const deck = await decks.create(alice, capitals);
		const other = await decks.create(alice, { ...capitals, name: 'Autre' });
		const card = await createCard(db, alice, { deckId: deck.id });
		const kept = await createCard(db, alice, { deckId: other.id });
		const earlier = new Date('2026-01-01T08:00:00Z');
		const alreadyDeleted = await createCard(db, alice, { deckId: deck.id });
		await db.card.update({ where: { id: alreadyDeleted.id }, data: { deletedAt: earlier } });

		await decks.softDelete(alice, deck.id, now);
		await decks.softDelete(alice, deck.id, new Date('2026-01-06T08:00:00Z'));

		expect(await db.deck.findUnique({ where: { id: deck.id } })).toMatchObject({ deletedAt: now });
		const deleted = await db.card.findMany({ where: { deckId: deck.id } });
		expect(Object.fromEntries(deleted.map((c) => [c.id, c.deletedAt]))).toEqual({
			[card.id]: now,
			[alreadyDeleted.id]: earlier
		});
		expect(await db.card.findUnique({ where: { id: kept.id } })).toMatchObject({ deletedAt: null });
		expect((await decks.list(alice)).map((d) => d.id)).toEqual([other.id]);
		await expect(decks.get(alice, deck.id)).rejects.toBeInstanceOf(NotFoundError);

		// Le dernier deck se supprime aussi : il n'en reste aucun.
		await decks.softDelete(alice, other.id);
	});

	it('refuses to delete a deck of another owner', async () => {
		const theirs = await createDeck(db, bob);
		await expect(decks.softDelete(alice, theirs.id)).rejects.toBeInstanceOf(NotFoundError);
		expect(await db.deck.findUnique({ where: { id: theirs.id } })).toMatchObject({
			deletedAt: null
		});
	});

	it('requires a language pair for a language deck and none for a subject', async () => {
		await expect(createDeck(db, alice, { languageB: null })).rejects.toThrow();
		await expect(createDeck(db, alice, { kind: 'subject' })).rejects.toThrow();
		await expect(createDeck(db, alice, subject)).resolves.toMatchObject({ kind: 'subject' });
	});

	it('gives the language pair of a language deck only', () => {
		expect(languagePair(FR_EN_DECK)).toEqual({ languageA: 'fr', languageB: 'en-GB' });
		expect(languagePair(subject)).toBeNull();
	});

	it('finds a deck by its name, ignoring case and spaces', () => {
		const listed = [{ name: 'Anglais' }, { name: 'Capitales du monde' }];
		expect(findDeckByName(listed, ' anglais ')).toBe(listed[0]);
		expect(findDeckByName(listed, 'CAPITALES  du monde')).toBe(listed[1]);
		expect(findDeckByName(listed, 'Allemand')).toBeUndefined();
	});

	it('resolves the requested deck, or the only one, by id or by name', () => {
		const english = { id: 'd1', name: 'Anglais' };
		const capitals = { id: 'd2', name: 'Capitales' };
		const both = [english, capitals];

		expect(resolveDeck([], undefined)).toEqual({ status: 'none' });
		expect(resolveDeck([], { id: 'd1' })).toEqual({ status: 'none' });
		expect(resolveDeck([english], undefined)).toEqual({ status: 'found', deck: english });
		expect(resolveDeck(both, undefined)).toEqual({ status: 'several' });
		expect(resolveDeck(both, { id: 'd2' })).toEqual({ status: 'found', deck: capitals });
		expect(resolveDeck(both, { name: ' capitales ' })).toEqual({ status: 'found', deck: capitals });
		expect(resolveDeck([english], { id: 'd2' })).toEqual({
			status: 'unknown',
			request: { id: 'd2' }
		});
		expect(resolveDeck([english], { name: 'Allemand' })).toEqual({
			status: 'unknown',
			request: { name: 'Allemand' }
		});
	});

	it('reviews both directions, or a_to_b only for a one-way deck', () => {
		expect(directionsOf({ bothDirections: true })).toEqual(['a_to_b', 'b_to_a']);
		expect(directionsOf({ bothDirections: false })).toEqual(['a_to_b']);
	});
});
