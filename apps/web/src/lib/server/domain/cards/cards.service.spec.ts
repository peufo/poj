import { assert, beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../testing/db';
import { createDeck, createUser, setNewCardsPerDay, SUBJECT_DECK } from '../../testing/factories';
import { createDecksService } from '../decks/decks.service';
import { NotFoundError } from '../errors';
import { forecast } from '../reviews/forecast';
import { DEFAULT_NEW_CARDS_PER_DAY } from '../reviews/new-cards';
import { createReviewsService } from '../reviews/reviews.service';
import { applyRating, pickState } from '../reviews/scheduler';
import { DAY, startOfDay } from '../time';
import { createCardsService, resetsProgress } from './cards.service';

const db = useTestDatabase();
const cards = createCardsService(db);

const now = new Date('2026-01-05T08:00:00Z');
const HOUR = 60 * 60 * 1000;
const input = { sideA: 'tenir pour acquis', sideB: 'to take for granted' };

let alice: string;
let bob: string;
/** Deck français → anglais de chacun. */
let aliceDeck: string;
let bobDeck: string;

beforeEach(async () => {
	alice = await createUser(db, 'Alice');
	bob = await createUser(db, 'Bob');
	aliceDeck = (await createDeck(db, alice)).id;
	bobDeck = (await createDeck(db, bob)).id;
});

/** Simule une réponse `good` sur les deux sens d'une carte. */
async function answerBoth(cardId: string) {
	for (const review of await db.review.findMany({ where: { cardId } })) {
		const { state } = applyRating(review, 'good', now, { hintUsed: false });
		await db.review.update({ where: { id: review.id }, data: state });
		await db.reviewLog.create({
			data: {
				reviewId: review.id,
				rating: 'good',
				hintUsed: false,
				origin: 'web',
				reviewedAt: now,
				...pickState(review)
			}
		});
	}
}

describe('cards service', () => {
	it('creates a card with both directions due immediately', async () => {
		const card = await cards.create(
			alice,
			aliceDeck,
			{ ...input, context: '  réunion budget ' },
			'web',
			now
		);

		expect(card).toMatchObject({ ...input, context: 'réunion budget', origin: 'web' });
		expect(card.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
		expect(card.reviews.map((r) => r.direction).sort()).toEqual(['a_to_b', 'b_to_a']);
		for (const review of card.reviews) {
			expect(review).toMatchObject({ state: 'new', due: now, reps: 0, lastReview: null });
		}
	});

	it('puts the card in the given deck of the owner, never in another owner’s', async () => {
		const subject = await createDeck(db, alice, SUBJECT_DECK);

		const card = await cards.create(alice, subject.id, input, 'web', now);
		expect(card.deckId).toBe(subject.id);
		expect(card.deck).toMatchObject({ kind: 'subject', ownerId: alice });
		await expect(cards.create(alice, bobDeck, input, 'web', now)).rejects.toBeInstanceOf(
			NotFoundError
		);
		await expect(cards.createOnce(alice, bobDeck, input, 'claude', now)).rejects.toBeInstanceOf(
			NotFoundError
		);
		expect(await db.card.count({ where: { ownerId: alice } })).toBe(1);
	});

	it('creates only the a_to_b review in a one-way deck', async () => {
		const { id } = await createDeck(db, alice, {
			...SUBJECT_DECK,
			labelA: 'Pays',
			labelB: 'Capitale'
		});
		const card = await cards.create(alice, id, { sideA: 'Suisse', sideB: 'Berne' }, 'web', now);
		const once = await cards.createOnce(
			alice,
			id,
			{ sideA: 'Pérou', sideB: 'Lima' },
			'claude',
			now
		);

		expect(card.reviews.map((r) => r.direction)).toEqual(['a_to_b']);
		expect(once.card.reviews.map((r) => r.direction)).toEqual(['a_to_b']);
	});

	it('stores an empty context as null', async () => {
		const card = await cards.create(alice, aliceDeck, { ...input, context: '   ' }, 'claude', now);
		expect(card.context).toBeNull();
	});

	it('creates once: an identical card within 10 minutes is returned, not duplicated', async () => {
		const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
		const first = await cards.createOnce(
			alice,
			aliceDeck,
			{ ...input, context: 'réunion' },
			'claude',
			now
		);
		const replay = await cards.createOnce(
			alice,
			aliceDeck,
			{ ...input, context: '  réunion ' },
			'claude',
			at(9)
		);

		expect(first.created).toBe(true);
		expect(first.card).toMatchObject({ ...input, context: 'réunion', origin: 'claude' });
		expect(first.card.reviews).toHaveLength(2);
		expect(replay).toEqual({ card: first.card, created: false });
		expect(await db.card.count()).toBe(1);

		// Un champ différent, un autre utilisateur ou plus de 10 minutes : nouvelle carte.
		expect((await cards.createOnce(alice, aliceDeck, input, 'claude', at(9))).created).toBe(true);
		expect(
			(await cards.createOnce(bob, bobDeck, { ...input, context: 'réunion' }, 'claude', at(9)))
				.created
		).toBe(true);
		const late = await cards.createOnce(
			alice,
			aliceDeck,
			{ ...input, context: 'réunion' },
			'claude',
			at(11)
		);
		expect(late.created).toBe(true);
		expect(late.card.id).not.toBe(first.card.id);
	});

	it('creates once again after the identical card was deleted', async () => {
		const first = await cards.createOnce(alice, aliceDeck, input, 'claude', now);
		await cards.softDelete(alice, first.card.id);

		const second = await cards.createOnce(alice, aliceDeck, input, 'claude', now);
		expect(second.created).toBe(true);
		expect(second.card.id).not.toBe(first.card.id);
	});

	it('creates once even under concurrent identical calls', async () => {
		const results = await Promise.all(
			[1, 2, 3].map(() => cards.createOnce(alice, aliceDeck, input, 'claude', now))
		);

		expect(results.filter((r) => r.created)).toHaveLength(1);
		expect(new Set(results.map((r) => r.card.id)).size).toBe(1);
	});

	describe('batch', () => {
		const minutesLater = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
		const batch = [
			{ sideA: 'chat', sideB: 'cat' },
			{ sideA: 'considérer comme acquis', sideB: ' To take for GRANTED ' },
			{ sideA: 'chaton', sideB: 'CAT' },
			{ sideA: 'chien', sideB: 'dog', context: ' ' }
		];

		it('classifies a batch against the deck and itself, without creating anything', async () => {
			const existing = await cards.create(alice, aliceDeck, input, 'web', now);
			await cards.create(bob, bobDeck, { sideA: 'chien', sideB: 'dog' }, 'web', now);

			const entries = await cards.checkBatch(
				alice,
				{ id: aliceDeck, kind: 'language' },
				batch,
				now
			);
			expect(entries).toEqual([
				{ status: 'new' },
				{ status: 'duplicate', duplicates: [expect.objectContaining({ id: existing.id })] },
				{ status: 'duplicate_in_batch', of: 0 },
				{ status: 'new' }
			]);
			expect(await db.card.count({ where: { ownerId: alice } })).toBe(1);
		});

		it('creates the new cards of a batch, in its order, with their reviews', async () => {
			await cards.create(alice, aliceDeck, input, 'web', now);

			const results = await cards.createBatch(alice, aliceDeck, batch, 'claude', now);
			expect(results.map((r) => r.status)).toEqual([
				'created',
				'duplicate',
				'duplicate_in_batch',
				'created'
			]);
			const created = await db.card.findMany({
				where: { origin: 'claude' },
				orderBy: { createdAt: 'asc' },
				include: { reviews: true }
			});
			expect(created.map((c) => [c.sideA, c.context])).toEqual([
				['chat', null],
				['chien', null]
			]);
			const [first, second] = created;
			assert.exists(first);
			assert.exists(second);
			expect(second.createdAt.getTime()).toBeGreaterThan(first.createdAt.getTime());
			expect(created.every((c) => c.reviews.length === 2 && c.deckId === aliceDeck)).toBe(true);
		});

		it('recognizes a replayed batch within 10 minutes, and duplicates after', async () => {
			const first = await cards.createBatch(alice, aliceDeck, batch, 'claude', now);
			const ids = first.flatMap((r) => (r.status === 'created' ? [r.card.id] : []));

			const replay = await cards.createBatch(alice, aliceDeck, batch, 'claude', minutesLater(9));
			expect(replay.flatMap((r) => (r.status === 'existing' ? [r.card.id] : []))).toEqual(ids);

			const later = await cards.createBatch(alice, aliceDeck, batch, 'claude', minutesLater(11));
			expect(later.map((r) => r.status)).toEqual([
				'duplicate',
				'duplicate',
				'duplicate_in_batch',
				'duplicate'
			]);
			expect(await db.card.count()).toBe(3);
		});

		it('creates all or nothing', async () => {
			const broken = batch.map((c, i) => (i === 3 ? { ...c, context: 'a\u0000b' } : c));

			await expect(cards.createBatch(alice, aliceDeck, broken, 'claude', now)).rejects.toThrow();
			expect(await db.card.count()).toBe(0);
		});

		it('refuses a deck of another owner', async () => {
			await expect(cards.createBatch(alice, bobDeck, batch, 'claude', now)).rejects.toThrow(
				NotFoundError
			);
		});
	});

	it('finds duplicates ignoring case and spaces, but not itself nor deleted cards', async () => {
		const first = await cards.create(alice, aliceDeck, input, 'web', now);
		const deleted = await cards.create(alice, aliceDeck, input, 'web', now);
		await cards.softDelete(alice, deleted.id);
		await cards.create(bob, bobDeck, input, 'web', now);

		const deck = first.deck;
		const found = await cards.findDuplicates(alice, deck, {
			sideA: 'autre chose',
			sideB: '  To   take for GRANTED '
		});
		expect(found.map((c) => c.id)).toEqual([first.id]);
		expect(await cards.findDuplicates(alice, deck, input, { excludeId: first.id })).toEqual([]);
	});

	it('finds duplicates within the deck only, on side B for a language and A for a subject', async () => {
		const french = await cards.create(alice, aliceDeck, input, 'web', now);
		const subject = await createDeck(db, alice, {
			kind: 'subject',
			languageA: null,
			languageB: null
		});
		const inSubject = await db.card.create({
			data: {
				ownerId: alice,
				deckId: subject.id,
				sideA: 'Suisse',
				sideB: 'to take for granted',
				origin: 'web'
			}
		});

		expect((await cards.findDuplicates(alice, french.deck, input)).map((c) => c.id)).toEqual([
			french.id
		]);
		expect(
			(await cards.findDuplicates(alice, subject, { sideA: 'suisse', sideB: 'Zurich' })).map(
				(c) => c.id
			)
		).toEqual([inSubject.id]);
		expect(
			await cards.findDuplicates(alice, subject, { sideA: 'Pérou', sideB: 'to take for granted' })
		).toEqual([]);
	});

	it('lists the owner’s cards, newest first, and searches all fields', async () => {
		const older = await cards.create(alice, aliceDeck, input, 'web', now);
		const newer = await cards.create(
			alice,
			aliceDeck,
			{ sideA: 'ce n’est pas sorcier', sideB: 'it’s not rocket science', context: 'podcast' },
			'claude',
			now
		);
		await cards.create(bob, bobDeck, { sideA: 'secret', sideB: 'secret' }, 'web', now);

		expect((await cards.list(alice)).map((c) => c.id)).toEqual([newer.id, older.id]);
		expect((await cards.list(alice, { query: 'GRANTED' })).map((c) => c.id)).toEqual([older.id]);
		expect((await cards.list(alice, { query: 'podcast' })).map((c) => c.id)).toEqual([newer.id]);
		expect((await cards.list(alice, { query: 'sorcier' })).map((c) => c.id)).toEqual([newer.id]);
	});

	it('searches `%`, `_` and `\\` literally, not as LIKE wildcards', async () => {
		await cards.create(alice, aliceDeck, input, 'web', now);
		const percent = await cards.create(
			alice,
			aliceDeck,
			{ sideA: '100 % sûr', sideB: '100_percent sure', context: 'a\\b' },
			'web',
			now
		);

		for (const query of ['%', '_', '\\']) {
			expect((await cards.list(alice, { query })).map((c) => c.id)).toEqual([percent.id]);
		}
	});

	it('searches regardless of accents, both ways, in every field', async () => {
		const ecole = await cards.create(
			alice,
			aliceDeck,
			{ sideA: 'à l’École', sideB: 'at school', context: 'Réunion des élèves' },
			'web',
			now
		);
		const cafe = await cards.create(
			alice,
			aliceDeck,
			{ sideA: 'un cafe', sideB: 'a café' },
			'web',
			now
		);
		const deleted = await cards.create(
			alice,
			aliceDeck,
			{ sideA: 'école', sideB: 'x' },
			'web',
			now
		);
		await cards.softDelete(alice, deleted.id);
		await cards.create(bob, bobDeck, { sideA: 'école', sideB: 'school' }, 'web', now);

		const search = async (query: string) => (await cards.list(alice, { query })).map((c) => c.id);
		expect(await search('ecole')).toEqual([ecole.id]);
		expect(await search('ÉCOLE')).toEqual([ecole.id]);
		expect(await search('reunion des eleves')).toEqual([ecole.id]);
		expect(await search('café')).toEqual([cafe.id]);
		expect(await search('CAFE')).toEqual([cafe.id]);
		expect(await search('écol_')).toEqual([]);
	});

	it('gets a card with its reviews and history', async () => {
		const { id } = await cards.create(alice, aliceDeck, input, 'web', now);
		await answerBoth(id);

		const detail = await cards.get(alice, id);
		expect(detail.reviews).toHaveLength(2);
		expect(detail.reviews.every((r) => r.logs.length === 1)).toBe(true);
	});

	it('resets progress when either side changes, keeping the history', async () => {
		const { id } = await cards.create(alice, aliceDeck, input, 'web', now);
		await answerBoth(id);
		const later = new Date('2026-01-06T08:00:00Z');

		const { card, progressReset } = await cards.update(
			alice,
			id,
			{ ...input, sideB: 'to take something for granted' },
			later
		);

		expect(progressReset).toBe(true);
		expect(card.sideB).toBe('to take something for granted');
		const detail = await cards.get(alice, id);
		for (const review of detail.reviews) {
			expect(review).toMatchObject({ state: 'new', due: later, reps: 0, lastReview: null });
			expect(review.logs).toHaveLength(1);
		}
	});

	it('keeps progress when only the context changes', async () => {
		const { id } = await cards.create(alice, aliceDeck, input, 'web', now);
		await answerBoth(id);

		const { progressReset } = await cards.update(alice, id, { ...input, context: 'au bureau' });

		expect(progressReset).toBe(false);
		const detail = await cards.get(alice, id);
		expect(detail.context).toBe('au bureau');
		expect(detail.reviews.every((r) => r.reps === 1)).toBe(true);
	});

	it('soft-deletes idempotently and hides the card everywhere', async () => {
		const { id } = await cards.create(alice, aliceDeck, input, 'web', now);

		await cards.softDelete(alice, id);
		await cards.softDelete(alice, id);

		expect(await cards.list(alice)).toEqual([]);
		await expect(cards.get(alice, id)).rejects.toBeInstanceOf(NotFoundError);
		expect(await cards.belt(alice, now)).toMatchObject({ stock: 0, due: 0, tokens: [] });
	});

	it('puts each card on the belt once, at the first of its presentations', async () => {
		const due = await cards.create(alice, aliceDeck, input, 'web', now);
		const later = await cards.create(alice, aliceDeck, { sideA: 'b', sideB: 'b' }, 'web', now);
		const deleted = await cards.create(alice, aliceDeck, { sideA: 'c', sideB: 'c' }, 'web', now);
		await cards.softDelete(alice, deleted.id);
		await cards.create(bob, bobDeck, input, 'web', now);
		await db.review.updateMany({
			where: { cardId: later.id, direction: 'a_to_b' },
			data: {
				due: new Date(now.getTime() + 2 * DAY),
				state: 'review',
				stability: 40,
				difficulty: 5
			}
		});
		await db.review.updateMany({
			where: { cardId: later.id, direction: 'b_to_a' },
			data: { due: new Date(now.getTime() + 30 * DAY) }
		});

		// `due` : ses deux sens sont dus, mais un seul sera présenté, l'autre mis de côté.
		expect(await cards.belt(alice, now)).toMatchObject({
			stock: 0,
			due: 1,
			tokens: [{ delayMs: 2 * DAY, state: 'review', stability: 40 }]
		});
		expect(await createReviewsService(db).countDue(alice, now)).toBe(1);
		expect(due.reviews).toHaveLength(2);
	});

	it('places a buried direction at the end of its burial', async () => {
		const answered = await cards.create(alice, aliceDeck, input, 'web', now);
		await cards.create(alice, aliceDeck, { sideA: 'b', sideB: 'b' }, 'web', now);
		// Le français → anglais de `answered` a été noté il y a 2 h : l'autre sens, dû,
		// est mis de côté encore 22 h.
		await db.review.updateMany({
			where: { cardId: answered.id, direction: 'a_to_b' },
			data: {
				lastReview: new Date(now.getTime() - 2 * HOUR),
				state: 'review',
				due: new Date(now.getTime() + 10 * DAY)
			}
		});

		expect(await cards.belt(alice, now)).toMatchObject({
			stock: 0,
			due: 1,
			tokens: [{ delayMs: 22 * HOUR, state: 'new', stability: 0 }]
		});
	});

	it('keeps the new cards beyond the daily limit apart, as a stock', async () => {
		for (let i = 0; i < DEFAULT_NEW_CARDS_PER_DAY + 2; i += 1) {
			await cards.create(alice, aliceDeck, { sideA: `q${i}`, sideB: `r${i}` }, 'web', now);
		}

		const belt = await cards.belt(alice, now);
		expect(belt).toMatchObject({ stock: 2, due: DEFAULT_NEW_CARDS_PER_DAY, tokens: [] });
		expect(belt.stock + belt.due + belt.tokens.length).toBe((await cards.list(alice)).length);
		expect(await createReviewsService(db).countDue(alice, now)).toBe(belt.due);
	});

	it('estimates both directions of each card, the waiting ones from the day the limit lets them in', async () => {
		await setNewCardsPerDay(db, alice, aliceDeck, 1, now);
		const ids: string[] = [];
		for (let i = 0; i < 3; i += 1) {
			const card = await cards.create(
				alice,
				aliceDeck,
				{ sideA: `q${i}`, sideB: `r${i}` },
				'web',
				now
			);
			ids.push(card.id);
		}

		const belt = await cards.belt(alice, now);

		// La première carte entre aujourd'hui, les deux autres demain et après-demain, à minuit ;
		// le second sens de chacune vient 24 h après le premier (l'ordre des ids les départage).
		const senses = [];
		for (const [day, cardId] of ids.entries()) {
			const start = day === 0 ? now : startOfDay(now, day);
			const reviews = await db.review.findMany({ where: { cardId }, orderBy: { id: 'asc' } });
			for (const [k, review] of reviews.entries()) {
				senses.push({
					id: review.id,
					state: pickState(review),
					start: new Date(start.getTime() + k * DAY)
				});
			}
		}
		expect(belt).toMatchObject({ stock: 2, due: 1 });
		expect(belt.forecast).toEqual(forecast(senses, now));
	});

	it('tells whether an edit resets progress, after cleaning the input', () => {
		const existing = { sideA: 'un devis', sideB: 'a quote' };
		expect(resetsProgress(existing, { sideA: ' un devis ', sideB: 'a quote', context: 'x' })).toBe(
			false
		);
		expect(resetsProgress(existing, { sideA: 'un devis', sideB: 'an estimate' })).toBe(true);
		expect(resetsProgress(existing, { sideA: 'le devis', sideB: 'a quote' })).toBe(true);
	});

	it('counts an overdue card as due, its other direction coming later', async () => {
		const overdue = await cards.create(alice, aliceDeck, input, 'web', now);
		await db.review.updateMany({
			where: { cardId: overdue.id, direction: 'a_to_b' },
			data: { due: new Date(now.getTime() - 4 * DAY) }
		});
		await db.review.updateMany({
			where: { cardId: overdue.id, direction: 'b_to_a' },
			data: { due: new Date(now.getTime() + HOUR) }
		});

		expect(await cards.belt(alice, now)).toMatchObject({ due: 1, tokens: [] });
	});

	it('hides other users’ cards', async () => {
		const { id } = await cards.create(bob, bobDeck, input, 'web', now);

		await expect(cards.get(alice, id)).rejects.toBeInstanceOf(NotFoundError);
		await expect(cards.update(alice, id, input)).rejects.toBeInstanceOf(NotFoundError);
		await expect(cards.softDelete(alice, id)).rejects.toBeInstanceOf(NotFoundError);
		expect(await cards.belt(alice, now)).toMatchObject({ stock: 0, due: 0, tokens: [] });
	});

	describe('per deck', () => {
		it('lists the cards of one deck only, and puts only them on the belt', async () => {
			const subject = await createDeck(db, alice, SUBJECT_DECK);
			const english = await cards.create(alice, aliceDeck, input, 'web', now);
			const capital = await cards.create(
				alice,
				subject.id,
				{ sideA: 'Suisse', sideB: 'Berne' },
				'web',
				now
			);
			const scope = { deckId: subject.id };

			expect((await cards.list(alice, scope)).map((c) => c.id)).toEqual([capital.id]);
			expect(await cards.list(alice, { ...scope, query: 'granted' })).toEqual([]);
			expect((await cards.list(alice, { deckId: aliceDeck })).map((c) => c.id)).toEqual([
				english.id
			]);
			expect(await cards.belt(alice, now, scope)).toMatchObject({ stock: 0, due: 1, tokens: [] });
			// Sans deck : tous les decks.
			expect(await cards.belt(alice, now)).toMatchObject({ stock: 0, due: 2, tokens: [] });
		});

		it('leaves out the b_to_a reviews of a deck turned one-way, without deleting them', async () => {
			const { id } = await cards.create(alice, aliceDeck, input, 'web', now);
			await db.review.updateMany({
				where: { cardId: id, direction: 'a_to_b' },
				data: { due: new Date(now.getTime() + DAY) }
			});
			await createDecksService(db).update(alice, aliceDeck, {
				name: 'Anglais',
				bothDirections: false
			});

			const [listed] = await cards.list(alice);
			assert.exists(listed);
			expect(listed.reviews.map((r) => r.direction)).toEqual(['a_to_b']);
			expect((await cards.get(alice, id)).reviews.map((r) => r.direction)).toEqual(['a_to_b']);
			// Le b_to_a, dû, ne compte plus : la carte n'attend que son a_to_b, demain.
			expect(await cards.belt(alice, now)).toMatchObject({ due: 0, tokens: [{ delayMs: DAY }] });
			expect(await db.review.count({ where: { cardId: id } })).toBe(2);
		});
	});
});
