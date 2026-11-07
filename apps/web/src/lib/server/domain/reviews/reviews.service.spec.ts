import { assert, beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../testing/db';
import {
	createCard,
	createDeck,
	createUser,
	setNewCardsPerDay,
	SUBJECT_DECK
} from '../../testing/factories';
import { createCardsService } from '../cards/cards.service';
import { createDecksService } from '../decks/decks.service';
import { ConflictError, NotFoundError } from '../errors';
import { startOfNextDay } from '../time';
import { DEFAULT_NEW_CARDS_PER_DAY } from './new-cards';
import {
	createReviewsService,
	MATURE_STABILITY_DAYS,
	VELOCITY_WINDOW_DAYS
} from './reviews.service';
import { applyRating, pickState } from './scheduler';
import type { Rating } from '../cards/types';
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
/** Deck français → anglais d'Alice, celui de `createCard`. */
let aliceDeck: string;

beforeEach(async () => {
	alice = await createUser(db, 'Alice');
	bob = await createUser(db, 'Bob');
	aliceDeck = (await createDeck(db, alice)).id;
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
		const recent = await cards.create(
			alice,
			aliceDeck,
			{ sideA: 'récent', sideB: 'recent' },
			'web',
			t0
		);
		const old = await cards.create(
			alice,
			aliceDeck,
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
			hint: 'ctx',
			version: 'new'
		});
		// Un sens par carte : répondre à l'un mettra l'autre de côté.
		expect(result).toMatchObject({ remaining: 2 });
	});

	it('reports nothing due with the next due date, ignoring other users', async () => {
		const { id } = await createCard(db, alice, { now: t0 });
		await setDue(id, at(DAY));
		await createCard(db, bob, { sideA: 'b', sideB: 'b', now: t0 });

		expect(await reviews.next(alice, t0)).toEqual({ review: null, nextDue: at(DAY), waiting: 0 });
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

		expect(await reviews.next(alice, t0)).toEqual({ review: null, nextDue: null, waiting: 0 });
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
		expect(await reviews.next(alice, at(1))).toEqual({ review: null, nextDue: due, waiting: 0 });

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
		const before = await db.review.findUniqueOrThrow({ where: { id: review.id } });

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
		assert.exists(log);
		expect(pickState(log)).toEqual(pickState(before));
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
		assert.exists(stored.lastReview);
		const free = await reviews.answer(
			alice,
			review.id,
			{ rating: 'good', version: stored.lastReview.toISOString(), origin: 'web' },
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

	it('offers no hint and does not cap the rating when the context is only a source', async () => {
		await createCard(db, alice, { context: 'Source : fr.wikipedia.org, 2026-11-01', now: t0 });
		const review = presented(await reviews.next(alice, t0));

		expect(review.hint).toBeNull();
		expect(review.context).toBe('Source : fr.wikipedia.org, 2026-11-01');
		expect(await reviews.requestHint(alice, review.id, t0)).toEqual({ context: null });
		const result = await reviews.answer(
			alice,
			review.id,
			{ rating: 'easy', version: review.version, origin: 'web' },
			t0
		);
		expect(result.rating).toBe('easy');
	});

	it('strips the source line from the hint of a mixed context', async () => {
		await createCard(db, alice, {
			context: 'Vu en cours\nSource : fr.wikipedia.org, 2026-11-01',
			now: t0
		});
		const review = presented(await reviews.next(alice, t0));

		expect(review.hint).toBe('Vu en cours');
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

	it('amends a later answer from the state left by the previous one', async () => {
		await createCard(db, alice, { now: t0 });
		const review = presented(await reviews.next(alice, t0));
		await reviews.answer(
			alice,
			review.id,
			{ rating: 'good', version: review.version, origin: 'web' },
			t0
		);
		const afterFirst = await db.review.findUniqueOrThrow({ where: { id: review.id } });
		assert.exists(afterFirst.lastReview);
		await reviews.answer(
			alice,
			review.id,
			{ rating: 'good', version: afterFirst.lastReview.toISOString(), origin: 'web' },
			at(20)
		);

		await reviews.amend(alice, review.id, 'again', at(25));

		const stored = await db.review.findUniqueOrThrow({ where: { id: review.id } });
		expect(pickState(stored)).toEqual(
			applyRating(afterFirst, 'again', at(20), { hintUsed: false }).state
		);
		expect(stored).toMatchObject({ reps: 2, lastReview: at(20) });
		const logs = await db.reviewLog.findMany({
			where: { reviewId: review.id },
			orderBy: { reviewedAt: 'asc' }
		});
		expect(logs.map((log) => [log.rating, log.amendedAt])).toEqual([
			['good', null],
			['again', at(25)]
		]);
		const [, amendedLog] = logs;
		assert.exists(amendedLog);
		expect(pickState(amendedLog)).toEqual(pickState(afterFirst));
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
		const other = card.reviews.find((r) => r.id !== review.id);
		assert.exists(other);
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
		assert.exists(last);
		expect(last.preview).toEqual(review.preview);

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
		assert.exists(review);

		await expect(reviews.requestHint(alice, review.id, t0)).rejects.toBeInstanceOf(NotFoundError);
		await expect(
			reviews.answer(alice, review.id, { rating: 'good', version: 'new', origin: 'web' }, t0)
		).rejects.toBeInstanceOf(NotFoundError);
		await expect(reviews.amend(alice, review.id, 'good', t0)).rejects.toBeInstanceOf(NotFoundError);
	});

	describe('with a card ahead', () => {
		const cardIds = (result: { reviews: NextReview[] }) => result.reviews.map((r) => r.cardId);

		it('presents two different cards when none is held, never both directions of one', async () => {
			const a = await createCard(db, alice, { sideA: 'a', sideB: 'a', now: t0 });
			const b = await createCard(db, alice, { sideA: 'b', sideB: 'b', now: at(1) });

			const lead = await reviews.lead(alice, at(2));
			expect(cardIds(lead)).toEqual([a.id, b.id]);
			expect(lead).toMatchObject({ held: false, remaining: 2, nextDue: null });
		});

		it('presents one card besides the held one, excluding both its directions', async () => {
			const a = await createCard(db, alice, { sideA: 'a', sideB: 'a', now: t0 });
			const b = await createCard(db, alice, { sideA: 'b', sideB: 'b', now: at(1) });
			await createCard(db, alice, { sideA: 'c', sideB: 'c', now: at(2) });
			expect(a.reviews).toHaveLength(2);
			const [, held] = a.reviews;
			assert.exists(held);

			const lead = await reviews.lead(alice, at(3), { holding: held.id });
			expect(cardIds(lead)).toEqual([b.id]);
			// La carte tenue reste à présenter : elle compte dans remaining.
			expect(lead).toMatchObject({ held: true, remaining: 3 });
		});

		it('ignores an unknown or foreign held review, but not a deleted card', async () => {
			const a = await createCard(db, alice, { sideA: 'a', sideB: 'a', now: t0 });
			await createCard(db, alice, { sideA: 'b', sideB: 'b', now: at(1) });
			const foreign = await createCard(db, bob, { now: t0 });
			const [foreignReview] = foreign.reviews;
			assert.exists(foreignReview);

			for (const holding of [foreignReview.id, '01900000-0000-7000-8000-000000000000']) {
				expect(await reviews.lead(alice, at(2), { holding })).toMatchObject({
					held: false,
					reviews: [{ cardId: a.id }, {}]
				});
			}
			await db.card.update({ where: { id: a.id }, data: { deletedAt: at(2) } });
			const [deleted] = a.reviews;
			assert.exists(deleted);
			const lead = await reviews.lead(alice, at(3), { holding: deleted.id });
			expect(lead).toMatchObject({ held: true, remaining: 1 });
			expect(lead.reviews).toHaveLength(1);
		});

		it('gives the next due date only when nothing is presented nor held', async () => {
			const {
				id,
				reviews: [held]
			} = await createCard(db, alice, { now: t0 });
			assert.exists(held);
			await setDue(id, at(DAY));

			expect(await reviews.lead(alice, t0)).toEqual({
				reviews: [],
				held: false,
				remaining: 0,
				nextDue: at(DAY)
			});
			expect(await reviews.lead(alice, t0, { holding: held.id, ahead: true })).toEqual({
				reviews: [],
				held: true,
				remaining: 0,
				nextDue: null
			});
		});

		it('keeps to the session deck and the new cards of the day', async () => {
			const subject = await createDeck(db, alice, SUBJECT_DECK);
			await setNewCardsPerDay(db, alice, subject.id, 1, t0);
			const capital = await createCard(db, alice, { deckId: subject.id, now: t0 });
			await createCard(db, alice, { deckId: subject.id, now: at(1) });
			await createCard(db, alice, { now: t0 });

			const lead = await reviews.lead(alice, at(2), { deckId: subject.id });
			expect(cardIds(lead)).toEqual([capital.id]);
			expect(lead).toMatchObject({ remaining: 1, nextDue: null });
		});
	});

	describe('per deck', () => {
		it('limits the session, its count and the last answer to one deck', async () => {
			const subject = await createDeck(db, alice, SUBJECT_DECK);
			const english = await createCard(db, alice, { now: t0 });
			const capital = await createCard(db, alice, {
				sideA: 'Suisse',
				sideB: 'Berne',
				deckId: subject.id,
				now: t0
			});
			await setDue(english.id, at(-DAY));
			const scope = { deckId: subject.id };

			// Tous les decks : la plus en retard d'abord ; le deck seul : ses cartes.
			expect(presented(await reviews.next(alice, t0)).cardId).toBe(english.id);
			const review = presented(await reviews.next(alice, t0, scope));
			expect(review).toMatchObject({ cardId: capital.id, deck: { id: subject.id } });
			expect(await reviews.countDue(alice, t0)).toBe(2);
			expect(await reviews.countDue(alice, t0, scope)).toBe(1);

			await reviews.answer(
				alice,
				review.id,
				{ rating: 'again', version: review.version, origin: 'web' },
				t0
			);
			expect(await reviews.lastAnswer(alice, at(1), scope)).toMatchObject({ cardId: capital.id });
			expect(await reviews.lastAnswer(alice, at(1), { deckId: aliceDeck })).toBeNull();
		});

		it('never presents the b_to_a reviews of a deck turned one-way', async () => {
			const { id } = await createCard(db, alice, { now: t0 });
			await db.review.updateMany({
				where: { cardId: id, direction: 'a_to_b' },
				data: { due: at(DAY) }
			});
			await createDecksService(db).update(alice, aliceDeck, {
				name: 'Anglais',
				bothDirections: false
			});

			expect(await reviews.countDue(alice, t0)).toBe(0);
			expect(await reviews.next(alice, t0)).toEqual({ review: null, nextDue: at(DAY), waiting: 0 });
			expect(presented(await reviews.next(alice, t0, { ahead: true })).direction).toBe('a_to_b');
		});
	});

	describe('new cards per day', () => {
		const LIMIT = DEFAULT_NEW_CARDS_PER_DAY;
		/** Deck de sujet d'Alice, à sens unique. */
		let subject: string;

		beforeEach(async () => {
			subject = (await createDeck(db, alice, SUBJECT_DECK)).id;
		});

		/** `n` cartes neuves créées à l'instant `at` dans le deck, de la plus ancienne à la plus récente. */
		async function addCards(deckId: string, n: number, at = t0): Promise<string[]> {
			const ids: string[] = [];
			for (let i = 0; i < n; i += 1) {
				const card = await cards.create(
					alice,
					deckId,
					{ sideA: `q${i}`, sideB: `r${i}` },
					'web',
					at
				);
				ids.push(card.id);
			}
			return ids;
		}

		/** Répond Easy (la carte s'éloigne de plusieurs jours) à la prochaine révision présentée. */
		async function answerNext(now: Date, options: { ahead?: boolean } = {}) {
			const review = presented(await reviews.next(alice, now, options));
			await reviews.answer(
				alice,
				review.id,
				{ rating: 'easy', version: review.version, origin: 'web' },
				now
			);
			return review;
		}

		it('presents only the 10 oldest new cards of a deck of 200 each day', async () => {
			const ids = await addCards(subject, 200);

			expect(await reviews.countDue(alice, at(1))).toBe(LIMIT);
			const first: string[] = [];
			for (let i = 0; i < LIMIT; i += 1) first.push((await answerNext(at(1))).cardId);
			expect(first).toEqual(ids.slice(0, LIMIT));

			// Le reste attend : il n'est pas dû, et la limite repart à minuit.
			const tomorrow = startOfNextDay(t0);
			expect(await reviews.countDue(alice, at(2))).toBe(0);
			expect(await reviews.next(alice, at(2))).toEqual({
				review: null,
				nextDue: tomorrow,
				waiting: 200 - LIMIT
			});
			expect(await reviews.countDue(alice, tomorrow)).toBe(LIMIT);
			const next = await reviews.next(alice, tomorrow);
			expect(next).toMatchObject({ remaining: LIMIT, review: { cardId: ids[LIMIT], isNew: true } });
		});

		it('leaves the cards already seen and the other decks alone', async () => {
			// Vue hier, de nouveau due : la limite d'aujourd'hui ne la concerne pas.
			const [seen] = await addCards(subject, 1, at(-DAY));
			assert.exists(seen);
			await answerNext(at(-DAY));
			await setDue(seen, t0);
			await addCards(subject, 15);
			await addCards(aliceDeck, 3);

			expect(await reviews.countDue(alice, at(1))).toBe(1 + LIMIT + 3);
			expect(await reviews.countDue(alice, at(1), { deckId: subject })).toBe(1 + LIMIT);
			expect(await reviews.countDue(alice, at(1), { deckId: aliceDeck })).toBe(3);
			expect(presented(await reviews.next(alice, at(1))).cardId).toBe(seen);
		});

		it('does not count the second direction of a started card', async () => {
			const ids = await addCards(aliceDeck, 25);
			for (let i = 0; i < LIMIT; i += 1) await answerNext(at(1));
			expect(await reviews.countDue(alice, at(2))).toBe(0);

			// Le lendemain : les seconds sens, hors limite, et 10 nouvelles cartes.
			const nextDay = at(DAY + 2);
			expect(await reviews.countDue(alice, nextDay)).toBe(2 * LIMIT);
			for (const cardId of ids.slice(0, LIMIT)) {
				const review = await db.review.findFirstOrThrow({ where: { cardId, lastReview: null } });
				await reviews.answer(
					alice,
					review.id,
					{ rating: 'easy', version: 'new', origin: 'web' },
					nextDay
				);
			}
			expect(await reviews.countDue(alice, at(DAY + 3))).toBe(LIMIT);
		});

		it('never brings waiting new cards forward when reviewing ahead', async () => {
			const ids = await addCards(subject, LIMIT + 2);
			for (let i = 0; i < LIMIT; i += 1) await answerNext(at(1));

			expect(await reviews.next(alice, at(2))).toMatchObject({ review: null, waiting: 2 });
			const early = await answerNext(at(2), { ahead: true });
			expect(ids.slice(0, LIMIT)).toContain(early.cardId);
			expect(early.isNew).toBe(false);
		});

		it('keeps the waiting new cards off the belt, as a stock', async () => {
			await addCards(subject, 30);

			expect(await cards.belt(alice, at(1))).toEqual({ stock: 30 - LIMIT, due: LIMIT, tokens: [] });
			expect(await reviews.countDue(alice, at(1))).toBe(LIMIT);
		});

		it('applies a new limit from now on, counting the cards started today', async () => {
			await addCards(subject, 20);
			await answerNext(at(1));
			await answerNext(at(1));

			await setNewCardsPerDay(db, alice, subject, 3, at(2));
			expect(await reviews.countDue(alice, at(3))).toBe(1);
			await setNewCardsPerDay(db, alice, subject, 15, at(4));
			expect(await reviews.countDue(alice, at(5))).toBe(13);
		});

		it('presents an edited card again, whatever the limit', async () => {
			await setNewCardsPerDay(db, alice, subject, 1, t0);
			const [edited] = await addCards(subject, 2);
			assert.exists(edited);
			await answerNext(at(1));
			await cards.update(alice, edited, { sideA: 'q0 bis', sideB: 'r0' }, at(2));

			expect(await reviews.countDue(alice, at(3))).toBe(1);
			expect(presented(await reviews.next(alice, at(3))).cardId).toBe(edited);
		});
	});

	describe('velocities', () => {
		const now = at(VELOCITY_WINDOW_DAYS * DAY);

		/** Une carte neuve, créée et répondue une fois à l'instant `when`. */
		async function answeredCard(owner: string, when: Date, rating: Rating = 'good') {
			const card = await createCard(db, owner, { sideA: `q${when.getTime()}`, now: when });
			const review = await db.review.findFirstOrThrow({ where: { cardId: card.id } });
			await reviews.answer(owner, review.id, { rating, version: 'new', origin: 'web' }, when);
			return card;
		}

		/** Une carte dont les sens ont la stabilité donnée (`a_to_b`, `b_to_a`), hors apprentissage. */
		async function cardWith(a: number, b: number, deckId = aliceDeck) {
			const card = await createCard(db, alice, { sideA: `s${a}-${b}`, deckId, now: t0 });
			await db.review.updateMany({ where: { cardId: card.id }, data: { state: 'review' } });
			await db.review.updateMany({
				where: { cardId: card.id, direction: 'a_to_b' },
				data: { stability: a }
			});
			await db.review.updateMany({
				where: { cardId: card.id, direction: 'b_to_a' },
				data: { stability: b }
			});
			return card;
		}

		it('starts at zero', async () => {
			expect(await reviews.velocities(alice, now)).toEqual({
				repsPerDay: 0,
				windowDays: VELOCITY_WINDOW_DAYS,
				matureCards: 0,
				matureDays: MATURE_STABILITY_DAYS
			});
		});

		it('averages every answer of the sliding window over its days', async () => {
			await answeredCard(alice, t0); // pile sept jours avant : hors de la fenêtre
			await answeredCard(alice, at(1), 'again');
			const deleted = await answeredCard(alice, at(2));
			await cards.softDelete(alice, deleted.id);
			await answeredCard(alice, now);
			await answeredCard(bob, at(3));

			const { repsPerDay } = await reviews.velocities(alice, now);
			expect(repsPerDay).toBe(3 / VELOCITY_WINDOW_DAYS);
		});

		it('keeps counting an answer after its card was reset', async () => {
			const card = await answeredCard(alice, at(1));
			await cards.update(alice, card.id, { sideA: 'autre', sideB: 'face' }, at(2));

			const { repsPerDay } = await reviews.velocities(alice, now);
			expect(repsPerDay).toBe(1 / VELOCITY_WINDOW_DAYS);
		});

		it('counts a card as mature once every direction reaches the threshold', async () => {
			await cardWith(MATURE_STABILITY_DAYS, MATURE_STABILITY_DAYS + 100);
			await cardWith(MATURE_STABILITY_DAYS, MATURE_STABILITY_DAYS - 0.1);
			await createCard(db, alice, { sideA: 'neuve', now: t0 });

			expect((await reviews.velocities(alice, now)).matureCards).toBe(1);
		});

		it('does not count a card relearning, whatever its stability', async () => {
			const card = await cardWith(100, 100);
			expect((await reviews.velocities(alice, now)).matureCards).toBe(1);

			await db.review.updateMany({
				where: { cardId: card.id, direction: 'a_to_b' },
				data: { state: 'relearning' }
			});
			expect((await reviews.velocities(alice, now)).matureCards).toBe(0);
		});

		it('ignores a direction the deck no longer reviews', async () => {
			await cardWith(100, 1);
			expect((await reviews.velocities(alice, now)).matureCards).toBe(0);

			await db.deck.update({ where: { id: aliceDeck }, data: { bothDirections: false } });
			expect((await reviews.velocities(alice, now)).matureCards).toBe(1);
		});

		it('leaves out deleted cards and the cards of other users, across all decks', async () => {
			const subject = await createDeck(db, alice, SUBJECT_DECK);
			await cardWith(100, 100);
			const deleted = await cardWith(200, 200);
			await cardWith(300, 300, subject.id);
			await cards.softDelete(alice, deleted.id);

			expect((await reviews.velocities(alice, now)).matureCards).toBe(2);
			expect((await reviews.velocities(bob, now)).matureCards).toBe(0);
		});
	});
});
