import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../testing/db';
import { createDeck, createUser, SUBJECT_DECK } from '../../testing/factories';
import { createCardsService } from '../cards/cards.service';
import { createDailyGoalService } from '../cards/daily-goal.service';
import type { Direction, Origin, Rating } from '../cards/types';
import { REVIEWS_CAP } from './review-day';
import { createReviewsService } from './reviews.service';

const db = useTestDatabase();
const cards = createCardsService(db);
const reviews = createReviewsService(db);
const goals = createDailyGoalService(db);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Lundi 12 janvier 2026, 11:00 à Zurich (UTC+1).
const now = new Date('2026-01-12T10:00:00Z');
/** Le jour `n` jours plus tôt, à `hour` heures (heure de Zurich, UTC+1 en janvier). */
const on = (n: number, hour = 11) => new Date(now.getTime() - n * DAY + (hour - 11) * HOUR);

let alice: string;
/** Deck de sujet d'Alice, révisé dans un seul sens : une révision par carte. */
let subject: string;
/** Deck de langue d'Alice, révisé dans les deux sens. */
let language: string;

beforeEach(async () => {
	alice = await createUser(db, 'Alice');
	subject = (await createDeck(db, alice, SUBJECT_DECK)).id;
	language = (await createDeck(db, alice, { name: 'Anglais' })).id;
});

/** `n` cartes créées à l'instant `at` (due aussitôt), dans le deck de sujet par défaut. */
async function addCards(at: Date, n = 1, deckId = subject): Promise<string[]> {
	const ids: string[] = [];
	for (let i = 0; i < n; i += 1) {
		const card = await cards.create(
			alice,
			deckId,
			{ sideA: `q ${at.toISOString()} ${i}`, sideB: `r ${i}` },
			'web',
			at
		);
		await db.card.update({ where: { id: card.id }, data: { createdAt: at } });
		ids.push(card.id);
	}
	return ids;
}

/** Répond à un sens d'une carte à l'instant `at`. `easy` l'éloigne de plusieurs jours. */
async function answer(
	cardId: string,
	at: Date,
	{
		rating = 'easy',
		origin = 'web',
		direction = 'a_to_b'
	}: { rating?: Rating; origin?: Origin; direction?: Direction } = {}
) {
	const review = await db.review.findUniqueOrThrow({
		where: { cardId_direction: { cardId, direction } }
	});
	const version = review.lastReview?.toISOString() ?? 'new';
	const result = await reviews.answer(alice, review.id, { rating, version, origin }, at);
	expect(result.replayed).toBe(false);
}

async function reviewDays(days: number, at = now) {
	return (await goals.progress(alice, at, days)).days.map((day) => day.review);
}

describe('review days', () => {
	it('is reached once every card due at the opening of the day has an answer', async () => {
		const [a, b] = await addCards(on(2), 2);

		expect((await reviewDays(1))[0]).toMatchObject({ due: 2, answered: 0, reached: false });
		await answer(a, on(0, 9));
		expect((await reviewDays(1))[0]).toMatchObject({ due: 2, answered: 1, reached: false });
		await answer(b, on(0, 9));

		const [yesterday, today] = await reviewDays(2);
		expect(today).toEqual({ due: 2, answered: 2, reviews: 2, reached: true, done: true });
		// Créées avant-hier, elles étaient déjà dues hier, sans réponse.
		expect(yesterday).toEqual({ due: 2, answered: 0, reviews: 0, reached: false, done: false });
	});

	it('counts a card answered Again as done, before and after it comes back', async () => {
		const [card] = await addCards(on(2));

		await answer(card, on(0, 9), { rating: 'again' });
		// Notée Again, elle est de nouveau due dans quelques minutes : le jour reste réussi.
		expect((await reviews.next(alice, on(0, 10))).review?.cardId).toBe(card);
		expect((await reviewDays(1, on(0, 10)))[0]).toMatchObject({ due: 1, reached: true });

		await answer(card, on(0, 10), { rating: 'good' });
		expect((await reviewDays(1))[0]).toEqual({
			due: 1,
			answered: 1,
			reviews: 2,
			reached: true,
			done: true
		});
	});

	it(`is reached after ${REVIEWS_CAP} reviews, even with cards still due`, async () => {
		const ids = await addCards(on(2), REVIEWS_CAP + 1);

		for (const id of ids.slice(0, REVIEWS_CAP - 1)) await answer(id, on(0, 9));
		expect((await reviewDays(1))[0]).toMatchObject({ due: REVIEWS_CAP + 1, reached: false });

		await answer(ids[REVIEWS_CAP - 1], on(0, 9));
		expect((await reviewDays(1))[0]).toEqual({
			due: REVIEWS_CAP + 1,
			answered: REVIEWS_CAP,
			reviews: REVIEWS_CAP,
			reached: true,
			done: true
		});
	});

	it('does not require a card that only becomes due during the day', async () => {
		// Créée hier : due hier à 11:00, donc à l'ouverture d'aujourd'hui, pas d'hier.
		await addCards(on(1));
		// Créée aujourd'hui : due demain à l'ouverture.
		await addCards(on(0, 8));

		const [yesterday, today] = await reviewDays(2);
		expect(yesterday).toMatchObject({ due: 0, reached: false });
		expect(today).toMatchObject({ due: 1, reached: false });
	});

	it('splits days at midnight in Europe/Zurich', async () => {
		const [late, early] = await addCards(on(2), 2);
		// 23:30 à Zurich dimanche (22:30 UTC) : hier. 00:30 lundi (23:30 UTC) : aujourd'hui.
		await answer(late, new Date('2026-01-11T22:30:00Z'));
		await answer(early, new Date('2026-01-11T23:30:00Z'));

		const [yesterday, today] = await reviewDays(2);
		expect(yesterday).toEqual({ due: 2, answered: 1, reviews: 1, reached: false, done: false });
		// Répondue hier soir avec Easy, `late` n'était plus due ce matin.
		expect(today).toEqual({ due: 1, answered: 1, reviews: 1, reached: true, done: true });
	});

	it('counts the reviews made by Claude', async () => {
		const [card] = await addCards(on(2));
		await answer(card, on(0, 9), { origin: 'claude' });

		expect((await reviewDays(1))[0]).toEqual({
			due: 1,
			answered: 1,
			reviews: 1,
			reached: true,
			done: true
		});
	});

	it('counts all decks together, and one answer per card whatever its direction', async () => {
		const [word] = await addCards(on(2), 1, language);
		const [question] = await addCards(on(2));

		expect((await reviewDays(1))[0]).toMatchObject({ due: 2, reached: false });
		// Répondre à un sens met l'autre de côté : la carte est faite.
		await answer(word, on(0, 9), { direction: 'b_to_a' });
		await answer(question, on(0, 9));
		expect((await reviewDays(1))[0]).toMatchObject({ due: 2, answered: 2, reached: true });
	});

	it('does not require a direction put aside by an answer to the other one', async () => {
		const [word] = await addCards(on(3), 1, language);
		// Hier soir, `a_to_b` : `b_to_a` est mise de côté jusqu'à ce soir 20:00.
		await answer(word, on(1, 20));

		const [yesterday, today] = await reviewDays(2);
		expect(yesterday).toMatchObject({ due: 1, answered: 1, reached: true });
		expect(today).toMatchObject({ due: 0, reached: false });
		// Demain matin, la mise de côté est finie : `b_to_a` est due.
		expect((await reviewDays(1, on(-1)))[0]).toMatchObject({ due: 1 });
	});

	it('drops a card deleted before the end of the day, but keeps its answers', async () => {
		const [kept, dropped, answered] = await addCards(on(2), 3);
		await answer(answered, on(1, 8));
		await answer(kept, on(1, 9));
		await db.card.updateMany({
			where: { id: { in: [dropped, answered] } },
			data: { deletedAt: on(1, 10) }
		});

		const [yesterday, today] = await reviewDays(2);
		expect(yesterday).toEqual({ due: 1, answered: 1, reviews: 2, reached: true, done: true });
		expect(today).toMatchObject({ due: 0 });
	});

	it("ignores other users' reviews", async () => {
		const bob = await createUser(db, 'Bob');
		const card = await cards.create(
			bob,
			(await createDeck(db, bob, SUBJECT_DECK)).id,
			{ sideA: 'q', sideB: 'r' },
			'web',
			on(2)
		);
		const [review] = card.reviews;
		await reviews.answer(
			bob,
			review.id,
			{ rating: 'easy', version: 'new', origin: 'web' },
			on(0, 9)
		);

		expect((await reviewDays(1))[0]).toEqual({
			due: 0,
			answered: 0,
			reviews: 0,
			reached: false,
			done: true
		});
	});
});
