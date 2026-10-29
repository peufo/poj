import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../testing/db';
import { createDeck, createUser } from '../../testing/factories';
import {
	createDecksService,
	DEFAULT_DECK,
	directionsOf,
	languagePair,
	lockOwner,
	resolveDeck
} from './decks.service';
import { NotFoundError } from '../errors';

const db = useTestDatabase();
const decks = createDecksService(db);

let alice: string;
let bob: string;

beforeEach(async () => {
	alice = await createUser(db, 'Alice');
	bob = await createUser(db, 'Bob');
});

const subject = { kind: 'subject', languageA: null, languageB: null } as const;

describe('decks service', () => {
	it('creates the default deck on first use, then returns it', async () => {
		const first = await decks.ensureDefault(alice);
		const again = await decks.ensureDefault(alice);

		expect(first).toMatchObject({
			...DEFAULT_DECK,
			ownerId: alice,
			labelA: null,
			labelB: null,
			deletedAt: null
		});
		expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
		expect(again.id).toBe(first.id);
		expect((await decks.ensureDefault(bob)).id).not.toBe(first.id);
	});

	it('creates a single default deck under concurrent calls', async () => {
		const results = await Promise.all([1, 2, 3].map(() => decks.ensureDefault(alice)));

		expect(new Set(results.map((d) => d.id)).size).toBe(1);
		expect(await db.deck.count({ where: { ownerId: alice } })).toBe(1);
	});

	it('takes the oldest deck that is not deleted', async () => {
		const deleted = await createDeck(db, alice, { deletedAt: new Date() });
		const oldest = await createDeck(db, alice, { ...subject, createdAt: new Date('2026-01-01') });
		await createDeck(db, alice, { createdAt: new Date('2026-02-01') });

		expect((await decks.ensureDefault(alice)).id).toBe(oldest.id);
		expect((await decks.ensureDefault(alice)).id).not.toBe(deleted.id);
	});

	it('resolves an explicit deck only if the owner has it', async () => {
		const mine = await createDeck(db, alice, subject);
		const theirs = await createDeck(db, bob);
		const resolve = (deckId?: string) =>
			db.$transaction(async (tx) => {
				await lockOwner(tx, alice);
				return resolveDeck(tx, alice, deckId);
			});

		expect((await resolve(mine.id)).id).toBe(mine.id);
		await expect(resolve(theirs.id)).rejects.toBeInstanceOf(NotFoundError);
		expect((await resolve()).id).toBe(mine.id);
	});

	it('requires a language pair for a language deck and none for a subject', async () => {
		await expect(createDeck(db, alice, { languageB: null })).rejects.toThrow();
		await expect(createDeck(db, alice, { kind: 'subject' })).rejects.toThrow();
		await expect(createDeck(db, alice, subject)).resolves.toMatchObject({ kind: 'subject' });
	});

	it('gives the language pair of a language deck only', () => {
		expect(languagePair(DEFAULT_DECK)).toEqual({ languageA: 'fr', languageB: 'en-GB' });
		expect(languagePair(subject)).toBeNull();
	});

	it('reviews both directions, or a_to_b only for a one-way deck', () => {
		expect(directionsOf({ bothDirections: true })).toEqual(['a_to_b', 'b_to_a']);
		expect(directionsOf({ bothDirections: false })).toEqual(['a_to_b']);
	});
});
