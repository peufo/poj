import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { PrismaClient } from '../../db/generated/prisma/client';
import { createCardsService } from '../cards/cards.service';
import { ConflictError, NotFoundError } from '../errors';
import { createReviewsService } from './reviews.service';
import type { NextReview, NextResult } from './types';

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: inject('databaseUrl') }) });
const cards = createCardsService(db);
const reviews = createReviewsService(db);

const t0 = new Date('2026-01-05T08:00:00Z');
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
const HOUR = 60;
const DAY = 24 * HOUR;

let alice: string;
let bob: string;

beforeEach(async () => {
	await db.$executeRaw`TRUNCATE cards, users CASCADE`;
	({ id: alice } = await db.user.create({ data: { name: 'Alice', email: 'alice@test.dev' } }));
	({ id: bob } = await db.user.create({ data: { name: 'Bob', email: 'bob@test.dev' } }));
});

afterAll(() => db.$disconnect());

function presented(result: NextResult): NextReview {
	if (!result.review) throw new Error('expected a review to be presented');
	return result.review;
}

async function setDue(cardId: string, due: Date) {
	await db.review.updateMany({ where: { cardId }, data: { due } });
}

describe('reviews service', () => {
	it('presents the most overdue review first, with prompt and expected answer', async () => {
		const recent = await cards.create(alice, { french: 'récent', english: 'recent' }, 'web', t0);
		const old = await cards.create(
			alice,
			{ french: 'ancien', english: 'old', context: 'ctx' },
			'web',
			t0
		);
		await setDue(recent.id, at(-HOUR));
		await db.review.update({
			where: { cardId_direction: { cardId: old.id, direction: 'en_to_fr' } },
			data: { due: at(-DAY) }
		});

		const result = await reviews.next(alice, t0);
		const review = presented(result);

		expect(review).toMatchObject({
			cardId: old.id,
			direction: 'en_to_fr',
			prompt: 'old',
			expected: 'ancien',
			hasHint: true,
			version: 'new'
		});
		expect(result).toMatchObject({ remaining: 4 });
	});

	it('reports nothing due with the next due date, ignoring other users', async () => {
		const { id } = await cards.create(alice, { french: 'a', english: 'a' }, 'web', t0);
		await setDue(id, at(DAY));
		await cards.create(bob, { french: 'b', english: 'b' }, 'web', t0);

		expect(await reviews.next(alice, t0)).toEqual({ review: null, nextDue: at(DAY) });
	});

	it('reviews ahead when nothing is due', async () => {
		const { id } = await cards.create(alice, { french: 'a', english: 'a' }, 'web', t0);
		await setDue(id, at(DAY));

		const result = await reviews.next(alice, t0, { ahead: true });
		expect(presented(result).cardId).toBe(id);
		expect(result).toMatchObject({ remaining: 0 });
	});

	it('excludes deleted cards', async () => {
		const { id } = await cards.create(alice, { french: 'a', english: 'a' }, 'web', t0);
		await cards.softDelete(alice, id);

		expect(await reviews.next(alice, t0)).toEqual({ review: null, nextDue: null });
	});

	it('buries the opposite direction for 24 hours after an answer', async () => {
		const { id } = await cards.create(alice, { french: 'a', english: 'a' }, 'web', t0);
		const first = presented(await reviews.next(alice, t0));
		const { due } = await reviews.answer(
			alice,
			first.id,
			{ rating: 'good', version: first.version, origin: 'web' },
			t0
		);

		// Le sens inverse est dû mais mis de côté ; le sens noté revient après son pas d'apprentissage.
		expect(await reviews.next(alice, at(1))).toEqual({ review: null, nextDue: due });

		const nextDay = presented(await reviews.next(alice, at(DAY + 1)));
		expect(nextDay).toMatchObject({ cardId: id });
		expect(nextDay.direction).not.toBe(first.direction);
	});

	it('records the answer in the history with the state before it', async () => {
		await cards.create(alice, { french: 'a', english: 'a' }, 'web', t0);
		const review = presented(await reviews.next(alice, t0));

		const result = await reviews.answer(
			alice,
			review.id,
			{ rating: 'again', version: review.version, origin: 'claude' },
			t0
		);

		expect(result).toMatchObject({ rating: 'again', replayed: false });
		expect(result.due.getTime()).toBeLessThanOrEqual(at(10).getTime());
		const [log] = await db.reviewLog.findMany({ where: { reviewId: review.id } });
		expect(log).toMatchObject({
			rating: 'again',
			origin: 'claude',
			hintUsed: false,
			reviewedAt: t0
		});
		expect(log.stateBefore).toMatchObject({ state: 'new', reps: 0, lastReview: null });
	});

	it('caps the rating at hard after a hint, until the next answer', async () => {
		await cards.create(alice, { french: 'a', english: 'a', context: 'au bureau' }, 'web', t0);
		const review = presented(await reviews.next(alice, t0));

		expect(await reviews.requestHint(alice, review.id, t0)).toEqual({ context: 'au bureau' });
		const capped = await reviews.answer(
			alice,
			review.id,
			{ rating: 'easy', version: review.version, origin: 'web' },
			at(1)
		);
		expect(capped.rating).toBe('hard');

		// La réponse suivante, sans nouvel indice, n'est plus plafonnée.
		const stored = await db.review.findUniqueOrThrow({ where: { id: review.id } });
		const free = await reviews.answer(
			alice,
			review.id,
			{ rating: 'good', version: stored.lastReview!.toISOString(), origin: 'web' },
			at(20)
		);
		expect(free.rating).toBe('good');
	});

	it('does not record a hint for a card without context', async () => {
		await cards.create(alice, { french: 'a', english: 'a' }, 'web', t0);
		const review = presented(await reviews.next(alice, t0));

		expect(await reviews.requestHint(alice, review.id, t0)).toEqual({ context: null });
		const result = await reviews.answer(
			alice,
			review.id,
			{ rating: 'good', version: review.version, origin: 'web' },
			t0
		);
		expect(result.rating).toBe('good');
	});

	it('ignores a replayed answer with a stale version', async () => {
		await cards.create(alice, { french: 'a', english: 'a' }, 'web', t0);
		const review = presented(await reviews.next(alice, t0));
		const answer = { rating: 'good' as const, version: review.version, origin: 'claude' as const };

		const first = await reviews.answer(alice, review.id, answer, t0);
		const replay = await reviews.answer(alice, review.id, { ...answer, rating: 'again' }, at(1));

		expect(replay).toEqual({ ...first, replayed: true });
		expect(await db.reviewLog.count({ where: { reviewId: review.id } })).toBe(1);
	});

	it('amends the last answer by recomputing from the previous state', async () => {
		await cards.create(alice, { french: 'a', english: 'a' }, 'web', t0);
		const review = presented(await reviews.next(alice, t0));
		await reviews.answer(
			alice,
			review.id,
			{ rating: 'good', version: review.version, origin: 'claude' },
			t0
		);

		const amended = await reviews.amend(alice, review.id, 'again', at(5));

		expect(amended.rating).toBe('again');
		const stored = await db.review.findUniqueOrThrow({ where: { id: review.id } });
		expect(stored).toMatchObject({ reps: 1, lapses: 0, state: 'learning', lastReview: t0 });
		expect(stored.due.getTime()).toBeLessThanOrEqual(at(10).getTime());
		const logs = await db.reviewLog.findMany({ where: { reviewId: review.id } });
		expect(logs).toHaveLength(1);
		expect(logs[0]).toMatchObject({ rating: 'again', amendedAt: at(5) });
	});

	it('refuses to amend after an hour, without an answer, or after a reset', async () => {
		const card = await cards.create(alice, { french: 'a', english: 'a' }, 'web', t0);
		const review = presented(await reviews.next(alice, t0));
		const other = card.reviews.find((r) => r.id !== review.id)!;
		await reviews.answer(
			alice,
			review.id,
			{ rating: 'good', version: review.version, origin: 'web' },
			t0
		);

		await expect(reviews.amend(alice, review.id, 'again', at(HOUR + 1))).rejects.toBeInstanceOf(
			ConflictError
		);
		await expect(reviews.amend(alice, other.id, 'again', at(1))).rejects.toBeInstanceOf(
			ConflictError
		);

		await cards.update(alice, card.id, { french: 'b', english: 'a' }, at(2));
		await expect(reviews.amend(alice, review.id, 'again', at(3))).rejects.toBeInstanceOf(
			ConflictError
		);
	});

	it('hides other users’ reviews', async () => {
		const card = await cards.create(bob, { french: 'a', english: 'a', context: 'x' }, 'web', t0);
		const [review] = card.reviews;

		await expect(reviews.requestHint(alice, review.id, t0)).rejects.toBeInstanceOf(NotFoundError);
		await expect(
			reviews.answer(alice, review.id, { rating: 'good', version: 'new', origin: 'web' }, t0)
		).rejects.toBeInstanceOf(NotFoundError);
		await expect(reviews.amend(alice, review.id, 'good', t0)).rejects.toBeInstanceOf(NotFoundError);
	});
});
