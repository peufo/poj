import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../testing/db';
import { createCard, createUser } from '../../testing/factories';
import { createCardsService } from '../cards/cards.service';
import { ConflictError, NotFoundError } from '../errors';
import { createReviewsService } from './reviews.service';
import type { NextReview, NextResult } from './types';

const db = useTestDatabase();
const cards = createCardsService(db);
const reviews = createReviewsService(db);

const t0 = new Date('2026-01-05T08:00:00Z');
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
const HOUR = 60;
const DAY = 24 * HOUR;

let alice: string;
let bob: string;

beforeEach(async () => {
	alice = await createUser(db, 'Alice');
	bob = await createUser(db, 'Bob');
});

function presented(result: NextResult): NextReview {
	if (!result.review) throw new Error('expected a review to be presented');
	return result.review;
}

async function setDue(cardId: string, due: Date) {
	await db.review.updateMany({ where: { cardId }, data: { due } });
}

describe('reviews service', () => {
	it('presents the most overdue review first, with prompt and expected answer', async () => {
		const recent = await cards.create(alice, { sideA: 'récent', sideB: 'recent' }, 'web', t0);
		const old = await cards.create(
			alice,
			{ sideA: 'ancien', sideB: 'old', context: 'ctx' },
			'web',
			t0
		);
		await setDue(recent.id, at(-HOUR));
		await db.review.update({
			where: { cardId_direction: { cardId: old.id, direction: 'b_to_a' } },
			data: { due: at(-DAY) }
		});

		const result = await reviews.next(alice, t0);
		const review = presented(result);

		expect(review).toMatchObject({
			cardId: old.id,
			direction: 'b_to_a',
			prompt: 'old',
			expected: 'ancien',
			hasHint: true,
			version: 'new'
		});
		// Un sens par carte : répondre à l'un mettra l'autre de côté.
		expect(result).toMatchObject({ remaining: 2 });
	});

	it('reports nothing due with the next due date, ignoring other users', async () => {
		const { id } = await createCard(db, alice, { now: t0 });
		await setDue(id, at(DAY));
		await createCard(db, bob, { sideA: 'b', sideB: 'b', now: t0 });

		expect(await reviews.next(alice, t0)).toEqual({ review: null, nextDue: at(DAY) });
	});

	it('reviews ahead when nothing is due', async () => {
		const { id } = await createCard(db, alice, { now: t0 });
		await setDue(id, at(DAY));

		const result = await reviews.next(alice, t0, { ahead: true });
		expect(presented(result).cardId).toBe(id);
		expect(result).toMatchObject({ remaining: 0 });
	});

	it('excludes deleted cards', async () => {
		const { id } = await createCard(db, alice, { now: t0 });
		await cards.softDelete(alice, id);

		expect(await reviews.next(alice, t0)).toEqual({ review: null, nextDue: null });
	});

	it('buries the opposite direction for 24 hours after an answer', async () => {
		const { id } = await createCard(db, alice, { now: t0 });
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

	it('counts only what the session will present, so the count never jumps', async () => {
		const a = await createCard(db, alice, { sideA: 'a', sideB: 'a', now: t0 });
		const b = await createCard(db, alice, { sideA: 'b', sideB: 'b', now: t0 });
		// `b` a un sens noté il y a une heure : l'autre est mis de côté.
		await db.review.updateMany({
			where: { cardId: b.id, direction: 'a_to_b' },
			data: { lastReview: at(-HOUR), state: 'review', due: at(10 * DAY) }
		});

		const first = await reviews.next(alice, t0);
		expect(first).toMatchObject({ remaining: 1, review: { cardId: a.id } });
		expect(await reviews.countDue(alice, t0)).toBe(1);

		const review = presented(first);
		await reviews.answer(
			alice,
			review.id,
			{ rating: 'easy', version: review.version, origin: 'web' },
			t0
		);
		expect(await reviews.next(alice, at(1))).toMatchObject({ review: null });
		expect(await reviews.countDue(alice, at(1))).toBe(0);
	});

	it('records the answer in the history with the state before it', async () => {
		await createCard(db, alice, { now: t0 });
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
		await createCard(db, alice, { context: 'au bureau', now: t0 });
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
		await createCard(db, alice, { now: t0 });
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
		await createCard(db, alice, { now: t0 });
		const review = presented(await reviews.next(alice, t0));
		const answer = { rating: 'good' as const, version: review.version, origin: 'claude' as const };

		const first = await reviews.answer(alice, review.id, answer, t0);
		const replay = await reviews.answer(alice, review.id, { ...answer, rating: 'again' }, at(1));

		expect(replay).toEqual({ ...first, replayed: true });
		expect(await db.reviewLog.count({ where: { reviewId: review.id } })).toBe(1);
	});

	it('amends the last answer by recomputing from the previous state', async () => {
		await createCard(db, alice, { now: t0 });
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

	it('leaves everything untouched when the amended rating is the one already recorded', async () => {
		await createCard(db, alice, { context: 'au bureau', now: t0 });
		const review = presented(await reviews.next(alice, t0));
		await reviews.requestHint(alice, review.id, t0);
		await reviews.answer(
			alice,
			review.id,
			{ rating: 'hard', version: review.version, origin: 'web' },
			t0
		);
		const before = await db.review.findUniqueOrThrow({ where: { id: review.id } });

		// Good est plafonné à Hard après l'indice : la note ne change pas.
		const amended = await reviews.amend(alice, review.id, 'good', at(5));

		expect(amended).toMatchObject({ rating: 'hard', due: before.due, changed: false });
		expect(await db.review.findUniqueOrThrow({ where: { id: review.id } })).toEqual(before);
		const [log] = await db.reviewLog.findMany({ where: { reviewId: review.id } });
		expect(log).toMatchObject({ rating: 'hard', amendedAt: null });
		expect(await reviews.amend(alice, review.id, 'hard', at(6))).toMatchObject({ changed: false });
		expect(await reviews.amend(alice, review.id, 'again', at(7))).toMatchObject({
			rating: 'again',
			changed: true
		});
	});

	it('refuses to amend after an hour, without an answer, or after a reset', async () => {
		const card = await createCard(db, alice, { now: t0 });
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

		await cards.update(alice, card.id, { sideA: 'b', sideB: 'a' }, at(2));
		await expect(reviews.amend(alice, review.id, 'again', at(3))).rejects.toBeInstanceOf(
			ConflictError
		);
	});

	it('presents what the review page needs: context, hint state, novelty and previews', async () => {
		await createCard(db, alice, { context: 'Au bureau', now: t0 });
		const fresh = presented(await reviews.next(alice, t0));

		expect(fresh).toMatchObject({ context: 'Au bureau', hintUsed: false, isNew: true, due: t0 });
		expect(fresh.preview.again.getTime()).toBeLessThan(fresh.preview.good.getTime());
		expect(fresh.preview.good.getTime()).toBeLessThan(fresh.preview.easy.getTime());

		// L'indice demandé survit à un rechargement de la page.
		await reviews.requestHint(alice, fresh.id, at(1));
		expect(presented(await reviews.next(alice, at(2)))).toMatchObject({
			id: fresh.id,
			hintUsed: true
		});
	});

	it('counts the reviews to present now, without buried siblings or deleted cards', async () => {
		const card = await createCard(db, alice, { now: t0 });
		const deleted = await createCard(db, alice, { sideA: 'b', sideB: 'b', now: t0 });
		await cards.softDelete(alice, deleted.id);
		await createCard(db, bob, { now: t0 });
		expect(await reviews.countDue(alice, t0)).toBe(1);

		const review = presented(await reviews.next(alice, t0));
		await reviews.answer(
			alice,
			review.id,
			{ rating: 'easy', version: review.version, origin: 'web' },
			t0
		);
		expect(await reviews.countDue(alice, at(1))).toBe(0);
		expect(card.reviews).toHaveLength(2);
	});

	it('exposes the last answer while it can be amended, with previews from the state before', async () => {
		expect(await reviews.lastAnswer(alice, t0)).toBeNull();
		const card = await createCard(db, alice, { sideA: 'fr', sideB: 'en', now: t0 });
		const review = presented(await reviews.next(alice, t0));
		const answered = await reviews.answer(
			alice,
			review.id,
			{ rating: 'good', version: review.version, origin: 'web' },
			t0
		);

		const last = await reviews.lastAnswer(alice, at(5));
		expect(last).toMatchObject({
			reviewId: review.id,
			cardId: card.id,
			direction: review.direction,
			prompt: review.prompt,
			rating: 'good',
			hintUsed: false,
			reviewedAt: t0,
			due: answered.due
		});
		expect(last!.preview).toEqual(review.preview);

		const amended = await reviews.amend(alice, review.id, 'again', at(6));
		expect(await reviews.lastAnswer(alice, at(7))).toMatchObject({
			rating: 'again',
			due: amended.due
		});

		expect(await reviews.lastAnswer(alice, at(HOUR + 1))).toBeNull();
		expect(await reviews.lastAnswer(bob, at(7))).toBeNull();
		await cards.update(alice, card.id, { sideA: 'autre', sideB: 'en' }, at(8));
		expect(await reviews.lastAnswer(alice, at(9))).toBeNull();
	});

	it('hides other users’ reviews', async () => {
		const card = await createCard(db, bob, { context: 'x', now: t0 });
		const [review] = card.reviews;

		await expect(reviews.requestHint(alice, review.id, t0)).rejects.toBeInstanceOf(NotFoundError);
		await expect(
			reviews.answer(alice, review.id, { rating: 'good', version: 'new', origin: 'web' }, t0)
		).rejects.toBeInstanceOf(NotFoundError);
		await expect(reviews.amend(alice, review.id, 'good', t0)).rejects.toBeInstanceOf(NotFoundError);
	});
});
