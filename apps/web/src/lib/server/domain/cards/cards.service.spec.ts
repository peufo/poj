import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../testing/db';
import { createUser } from '../../testing/factories';
import { NotFoundError } from '../errors';
import { applyRating } from '../reviews/scheduler';
import { createCardsService, resetsProgress } from './cards.service';

const db = useTestDatabase();
const cards = createCardsService(db);

const now = new Date('2026-01-05T08:00:00Z');
const input = { french: 'tenir pour acquis', english: 'to take for granted' };

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
		expect(card.reviews.map((r) => r.direction).sort()).toEqual(['en_to_fr', 'fr_to_en']);
		for (const review of card.reviews) {
			expect(review).toMatchObject({ state: 'new', due: now, reps: 0, lastReview: null });
		}
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

		const found = await cards.findDuplicates(alice, '  To   take for GRANTED ');
		expect(found.map((c) => c.id)).toEqual([first.id]);
		expect(await cards.findDuplicates(alice, input.english, { excludeId: first.id })).toEqual([]);
	});

	it('lists the owner’s cards, newest first, and searches all fields', async () => {
		const older = await cards.create(alice, input, 'web', now);
		const newer = await cards.create(
			alice,
			{ french: 'ce n’est pas sorcier', english: 'it’s not rocket science', context: 'podcast' },
			'claude',
			now
		);
		await cards.create(bob, { french: 'secret', english: 'secret' }, 'web', now);

		expect((await cards.list(alice)).map((c) => c.id)).toEqual([newer.id, older.id]);
		expect((await cards.list(alice, { query: 'GRANTED' })).map((c) => c.id)).toEqual([older.id]);
		expect((await cards.list(alice, { query: 'podcast' })).map((c) => c.id)).toEqual([newer.id]);
		expect((await cards.list(alice, { query: 'sorcier' })).map((c) => c.id)).toEqual([newer.id]);
	});

	it('searches `%`, `_` and `\\` literally, not as LIKE wildcards', async () => {
		await cards.create(alice, input, 'web', now);
		const percent = await cards.create(
			alice,
			{ french: '100 % sûr', english: '100_percent sure', context: 'a\\b' },
			'web',
			now
		);

		for (const query of ['%', '_', '\\']) {
			expect((await cards.list(alice, { query })).map((c) => c.id)).toEqual([percent.id]);
		}
	});

	it('gets a card with its reviews and history', async () => {
		const { id } = await cards.create(alice, input, 'web', now);
		await answerBoth(id);

		const detail = await cards.get(alice, id);
		expect(detail.reviews).toHaveLength(2);
		expect(detail.reviews.every((r) => r.logs.length === 1)).toBe(true);
	});

	it('resets progress when french or english changes, keeping the history', async () => {
		const { id } = await cards.create(alice, input, 'web', now);
		await answerBoth(id);
		const later = new Date('2026-01-06T08:00:00Z');

		const { card, progressReset } = await cards.update(
			alice,
			id,
			{ ...input, english: 'to take something for granted' },
			later
		);

		expect(progressReset).toBe(true);
		expect(card.english).toBe('to take something for granted');
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
		const notDue = await cards.create(alice, { french: 'b', english: 'b' }, 'web', now);
		const lateToday = await cards.create(alice, { french: 'c', english: 'c' }, 'web', now);
		// Échéance à 23:30 heure de Zurich le jour même : due aujourd'hui
		await db.review.updateMany({
			where: { cardId: lateToday.id, direction: 'fr_to_en' },
			data: { due: new Date('2026-01-05T22:30:00Z') }
		});
		await db.review.updateMany({
			where: { cardId: lateToday.id, direction: 'en_to_fr' },
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
		const fresh = await cards.create(alice, { french: 'b', english: 'b' }, 'web', now);
		// Le français → anglais de `answered` a été noté il y a 2 h : l'autre sens, dû,
		// est mis de côté jusqu'à demain 6 h UTC.
		const twoHoursAgo = new Date(now.getTime() - 2 * 3_600_000);
		await db.review.updateMany({
			where: { cardId: answered.id, direction: 'fr_to_en' },
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
		const existing = { french: 'un devis', english: 'a quote' };
		expect(
			resetsProgress(existing, { french: ' un devis ', english: 'a quote', context: 'x' })
		).toBe(false);
		expect(resetsProgress(existing, { french: 'un devis', english: 'an estimate' })).toBe(true);
		expect(resetsProgress(existing, { french: 'le devis', english: 'a quote' })).toBe(true);
	});

	it('spreads due reviews over the next Zurich days, overdue ones today', async () => {
		const overdue = await cards.create(alice, input, 'web', now);
		const later = await cards.create(alice, { french: 'b', english: 'b' }, 'web', now);
		const deleted = await cards.create(alice, { french: 'c', english: 'c' }, 'web', now);
		await cards.softDelete(alice, deleted.id);
		await cards.create(bob, input, 'web', now);
		await db.review.updateMany({
			where: { cardId: overdue.id, direction: 'fr_to_en' },
			data: { due: new Date('2026-01-01T09:00:00Z') }
		});
		await db.review.updateMany({
			where: { cardId: overdue.id, direction: 'en_to_fr' },
			// 23:30 à Zurich : encore aujourd'hui
			data: { due: new Date('2026-01-05T22:30:00Z') }
		});
		await db.review.updateMany({
			where: { cardId: later.id, direction: 'fr_to_en' },
			// 00:30 à Zurich le lendemain
			data: { due: new Date('2026-01-05T23:30:00Z') }
		});
		await db.review.updateMany({
			where: { cardId: later.id, direction: 'en_to_fr' },
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
