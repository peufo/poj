import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../testing/db';
import { createDeck, createUser } from '../../testing/factories';
import { DEFAULT_DECK } from '../decks/decks.service';
import { NotFoundError } from '../errors';
import { applyRating } from '../reviews/scheduler';
import { createCardsService, resetsProgress } from './cards.service';

const db = useTestDatabase();
const cards = createCardsService(db);

const now = new Date('2026-01-05T08:00:00Z');
const input = { sideA: 'tenir pour acquis', sideB: 'to take for granted' };

let alice: string;
let bob: string;

beforeEach(async () => {
	alice = await createUser(db, 'Alice');
	bob = await createUser(db, 'Bob');
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
				stateBefore: {}
			}
		});
	}
}

describe('cards service', () => {
	it('creates a card with both directions due immediately', async () => {
		const card = await cards.create(alice, { ...input, context: '  réunion budget ' }, 'web', now);

		expect(card).toMatchObject({ ...input, context: 'réunion budget', origin: 'web' });
		expect(card.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
		expect(card.reviews.map((r) => r.direction).sort()).toEqual(['a_to_b', 'b_to_a']);
		for (const review of card.reviews) {
			expect(review).toMatchObject({ state: 'new', due: now, reps: 0, lastReview: null });
		}
	});

	it('puts the card in the owner’s default deck, created on first use', async () => {
		const card = await cards.create(alice, input, 'web', now);
		const second = await cards.createOnce(alice, { ...input, sideB: 'x' }, 'claude', now);

		expect(card.deck).toMatchObject({ ...DEFAULT_DECK, ownerId: alice });
		expect(second.card.deckId).toBe(card.deckId);
		expect(await db.deck.count()).toBe(1);
	});

	it('creates only the a_to_b review in a one-way deck', async () => {
		await createDeck(db, alice, {
			kind: 'subject',
			languageA: null,
			languageB: null,
			labelA: 'Pays',
			labelB: 'Capitale',
			bothDirections: false
		});
		const card = await cards.create(alice, { sideA: 'Suisse', sideB: 'Berne' }, 'web', now);
		const once = await cards.createOnce(alice, { sideA: 'Pérou', sideB: 'Lima' }, 'claude', now);

		expect(card.reviews.map((r) => r.direction)).toEqual(['a_to_b']);
		expect(once.card.reviews.map((r) => r.direction)).toEqual(['a_to_b']);
	});

	it('stores an empty context as null', async () => {
		const card = await cards.create(alice, { ...input, context: '   ' }, 'claude', now);
		expect(card.context).toBeNull();
	});

	it('creates once: an identical card within 10 minutes is returned, not duplicated', async () => {
		const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
		const first = await cards.createOnce(alice, { ...input, context: 'réunion' }, 'claude', now);
		const replay = await cards.createOnce(
			alice,
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
		expect((await cards.createOnce(alice, input, 'claude', at(9))).created).toBe(true);
		expect(
			(await cards.createOnce(bob, { ...input, context: 'réunion' }, 'claude', at(9))).created
		).toBe(true);
		const late = await cards.createOnce(alice, { ...input, context: 'réunion' }, 'claude', at(11));
		expect(late.created).toBe(true);
		expect(late.card.id).not.toBe(first.card.id);
	});

	it('creates once again after the identical card was deleted', async () => {
		const first = await cards.createOnce(alice, input, 'claude', now);
		await cards.softDelete(alice, first.card.id);

		const second = await cards.createOnce(alice, input, 'claude', now);
		expect(second.created).toBe(true);
		expect(second.card.id).not.toBe(first.card.id);
	});

	it('creates once even under concurrent identical calls', async () => {
		const results = await Promise.all(
			[1, 2, 3].map(() => cards.createOnce(alice, input, 'claude', now))
		);

		expect(results.filter((r) => r.created)).toHaveLength(1);
		expect(new Set(results.map((r) => r.card.id)).size).toBe(1);
	});

	it('finds duplicates ignoring case and spaces, but not itself nor deleted cards', async () => {
		const first = await cards.create(alice, input, 'web', now);
		const deleted = await cards.create(alice, input, 'web', now);
		await cards.softDelete(alice, deleted.id);
		await cards.create(bob, input, 'web', now);

		const deck = first.deck;
		const found = await cards.findDuplicates(alice, deck, {
			sideA: 'autre chose',
			sideB: '  To   take for GRANTED '
		});
		expect(found.map((c) => c.id)).toEqual([first.id]);
		expect(await cards.findDuplicates(alice, deck, input, { excludeId: first.id })).toEqual([]);
	});

	it('finds duplicates within the deck only, on side B for a language and A for a subject', async () => {
		const french = await cards.create(alice, input, 'web', now);
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
		const older = await cards.create(alice, input, 'web', now);
		const newer = await cards.create(
			alice,
			{ sideA: 'ce n’est pas sorcier', sideB: 'it’s not rocket science', context: 'podcast' },
			'claude',
			now
		);
		await cards.create(bob, { sideA: 'secret', sideB: 'secret' }, 'web', now);

		expect((await cards.list(alice)).map((c) => c.id)).toEqual([newer.id, older.id]);
		expect((await cards.list(alice, { query: 'GRANTED' })).map((c) => c.id)).toEqual([older.id]);
		expect((await cards.list(alice, { query: 'podcast' })).map((c) => c.id)).toEqual([newer.id]);
		expect((await cards.list(alice, { query: 'sorcier' })).map((c) => c.id)).toEqual([newer.id]);
	});

	it('searches `%`, `_` and `\\` literally, not as LIKE wildcards', async () => {
		await cards.create(alice, input, 'web', now);
		const percent = await cards.create(
			alice,
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
			{ sideA: 'à l’École', sideB: 'at school', context: 'Réunion des élèves' },
			'web',
			now
		);
		const cafe = await cards.create(alice, { sideA: 'un cafe', sideB: 'a café' }, 'web', now);
		const deleted = await cards.create(alice, { sideA: 'école', sideB: 'x' }, 'web', now);
		await cards.softDelete(alice, deleted.id);
		await cards.create(bob, { sideA: 'école', sideB: 'school' }, 'web', now);

		const search = async (query: string) => (await cards.list(alice, { query })).map((c) => c.id);
		expect(await search('ecole')).toEqual([ecole.id]);
		expect(await search('ÉCOLE')).toEqual([ecole.id]);
		expect(await search('reunion des eleves')).toEqual([ecole.id]);
		expect(await search('café')).toEqual([cafe.id]);
		expect(await search('CAFE')).toEqual([cafe.id]);
		expect(await search('écol_')).toEqual([]);
	});

	it('gets a card with its reviews and history', async () => {
		const { id } = await cards.create(alice, input, 'web', now);
		await answerBoth(id);

		const detail = await cards.get(alice, id);
		expect(detail.reviews).toHaveLength(2);
		expect(detail.reviews.every((r) => r.logs.length === 1)).toBe(true);
	});

	it('resets progress when either side changes, keeping the history', async () => {
		const { id } = await cards.create(alice, input, 'web', now);
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
		const { id } = await cards.create(alice, input, 'web', now);
		await answerBoth(id);

		const { progressReset } = await cards.update(alice, id, { ...input, context: 'au bureau' });

		expect(progressReset).toBe(false);
		const detail = await cards.get(alice, id);
		expect(detail.context).toBe('au bureau');
		expect(detail.reviews.every((r) => r.reps === 1)).toBe(true);
	});

	it('soft-deletes idempotently and hides the card everywhere', async () => {
		const { id } = await cards.create(alice, input, 'web', now);

		await cards.softDelete(alice, id);
		await cards.softDelete(alice, id);

		expect(await cards.list(alice)).toEqual([]);
		await expect(cards.get(alice, id)).rejects.toBeInstanceOf(NotFoundError);
		expect(await cards.stats(alice, now)).toEqual({ totalCards: 0, dueToday: 0 });
	});

	it('counts cards and reviews due before the end of the Zurich day', async () => {
		const due = await cards.create(alice, input, 'web', now);
		const notDue = await cards.create(alice, { sideA: 'b', sideB: 'b' }, 'web', now);
		const lateToday = await cards.create(alice, { sideA: 'c', sideB: 'c' }, 'web', now);
		// Échéance à 23:30 heure de Zurich le jour même : due aujourd'hui
		await db.review.updateMany({
			where: { cardId: lateToday.id, direction: 'a_to_b' },
			data: { due: new Date('2026-01-05T22:30:00Z') }
		});
		await db.review.updateMany({
			where: { cardId: lateToday.id, direction: 'b_to_a' },
			data: { due: new Date('2026-01-20T09:00:00Z') }
		});
		// Échéance le lendemain : pas due aujourd'hui
		await db.review.updateMany({
			where: { cardId: notDue.id },
			data: { due: new Date('2026-01-06T09:00:00Z') }
		});

		// `due` : un seul sens aujourd'hui, l'autre sera mis de côté jusqu'à demain.
		expect(await cards.stats(alice, now)).toEqual({ totalCards: 3, dueToday: 2 });
		expect(due.reviews).toHaveLength(2);
	});

	it('leaves buried directions out of today until their burial ends', async () => {
		const answered = await cards.create(alice, input, 'web', now);
		const fresh = await cards.create(alice, { sideA: 'b', sideB: 'b' }, 'web', now);
		// Le français → anglais de `answered` a été noté il y a 2 h : l'autre sens, dû,
		// est mis de côté jusqu'à demain 6 h UTC.
		const twoHoursAgo = new Date(now.getTime() - 2 * 3_600_000);
		await db.review.updateMany({
			where: { cardId: answered.id, direction: 'a_to_b' },
			data: { lastReview: twoHoursAgo, state: 'review', due: new Date('2026-01-15T09:00:00Z') }
		});

		const stats = await cards.stats(alice, now);
		const days = await cards.horizon(alice, now, 3);

		// Aujourd'hui : un seul sens de `fresh` ; demain : l'autre sens de `fresh`, et le sens
		// de `answered` à la fin de sa mise de côté.
		expect(stats.dueToday).toBe(1);
		expect(days.map((d) => d.count)).toEqual([1, 2, 0]);
		expect(fresh.reviews).toHaveLength(2);
	});

	it('tells whether an edit resets progress, after cleaning the input', () => {
		const existing = { sideA: 'un devis', sideB: 'a quote' };
		expect(resetsProgress(existing, { sideA: ' un devis ', sideB: 'a quote', context: 'x' })).toBe(
			false
		);
		expect(resetsProgress(existing, { sideA: 'un devis', sideB: 'an estimate' })).toBe(true);
		expect(resetsProgress(existing, { sideA: 'le devis', sideB: 'a quote' })).toBe(true);
	});

	it('spreads due reviews over the next Zurich days, overdue ones today', async () => {
		const overdue = await cards.create(alice, input, 'web', now);
		const later = await cards.create(alice, { sideA: 'b', sideB: 'b' }, 'web', now);
		const deleted = await cards.create(alice, { sideA: 'c', sideB: 'c' }, 'web', now);
		await cards.softDelete(alice, deleted.id);
		await cards.create(bob, input, 'web', now);
		await db.review.updateMany({
			where: { cardId: overdue.id, direction: 'a_to_b' },
			data: { due: new Date('2026-01-01T09:00:00Z') }
		});
		await db.review.updateMany({
			where: { cardId: overdue.id, direction: 'b_to_a' },
			// 23:30 à Zurich : encore aujourd'hui
			data: { due: new Date('2026-01-05T22:30:00Z') }
		});
		await db.review.updateMany({
			where: { cardId: later.id, direction: 'a_to_b' },
			// 00:30 à Zurich le lendemain
			data: { due: new Date('2026-01-05T23:30:00Z') }
		});
		await db.review.updateMany({
			where: { cardId: later.id, direction: 'b_to_a' },
			data: { due: new Date('2026-01-20T09:00:00Z') }
		});

		const days = await cards.horizon(alice, now, 3);

		// `overdue` : un sens aujourd'hui, l'autre demain (mis de côté après la réponse) ;
		// `later` : un sens demain, l'autre au-delà de l'horizon.
		expect(days).toEqual([
			{ date: new Date('2026-01-04T23:00:00Z'), count: 1 },
			{ date: new Date('2026-01-05T23:00:00Z'), count: 2 },
			{ date: new Date('2026-01-06T23:00:00Z'), count: 0 }
		]);
		expect(days[0].count).toBe((await cards.stats(alice, now)).dueToday);
	});

	it('hides other users’ cards', async () => {
		const { id } = await cards.create(bob, input, 'web', now);

		await expect(cards.get(alice, id)).rejects.toBeInstanceOf(NotFoundError);
		await expect(cards.update(alice, id, input)).rejects.toBeInstanceOf(NotFoundError);
		await expect(cards.softDelete(alice, id)).rejects.toBeInstanceOf(NotFoundError);
		expect(await cards.stats(alice, now)).toEqual({ totalCards: 0, dueToday: 0 });
	});
});
