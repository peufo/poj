import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../testing/db';
import { createCard, createDeck, createUser, SUBJECT_DECK } from '../../testing/factories';
import { createCardsService } from '../cards/cards.service';
import { createReviewsService } from '../reviews/reviews.service';
import { ACTIVITY_WEEKS, createActivityService } from './activity.service';

const db = useTestDatabase();
const cards = createCardsService(db);
const reviews = createReviewsService(db);
const activity = createActivityService(db);

/** Un mercredi d'hiver : Zurich est à UTC+1. */
const now = new Date('2026-01-07T10:00:00Z');

let alice: string;
let bob: string;
let aliceDeck: string;

beforeEach(async () => {
	alice = await createUser(db, 'Alice');
	bob = await createUser(db, 'Bob');
	aliceDeck = (await createDeck(db, alice)).id;
});

/** Une carte créée à `createdAt`, dont un sens est répondu à chaque instant de `answers`. */
async function cardAnswered(owner: string, createdAt: Date, answers: Date[] = [], deckId?: string) {
	const card = await createCard(db, owner, {
		sideA: `q${createdAt.getTime()}-${Math.random()}`,
		now: createdAt,
		deckId
	});
	// `create` laisse la base horodater la carte.
	await db.card.update({ where: { id: card.id }, data: { createdAt } });
	const review = await db.review.findFirstOrThrow({
		where: { cardId: card.id, direction: 'a_to_b' }
	});
	let version = 'new';
	for (const when of answers) {
		await reviews.answer(owner, review.id, { rating: 'good', version, origin: 'web' }, when);
		version = when.toISOString();
	}
	return card;
}

const byDate = (days: { date: string; added: number; reviewed: number }[]) =>
	Object.fromEntries(
		days.filter((d) => d.added || d.reviewed).map((d) => [d.date, [d.added, d.reviewed]])
	);

describe('activity service', () => {
	it('lists every day from the monday weeks ago up to today, empty at first', async () => {
		const days = await activity.daily(alice, now, { weeks: 2 });

		expect(days.map((d) => d.date)).toEqual([
			'2025-12-29',
			'2025-12-30',
			'2025-12-31',
			'2026-01-01',
			'2026-01-02',
			'2026-01-03',
			'2026-01-04',
			'2026-01-05',
			'2026-01-06',
			'2026-01-07'
		]);
		expect(days.every((d) => d.added === 0 && d.reviewed === 0)).toBe(true);
	});

	it('covers a year by default', async () => {
		const days = await activity.daily(alice, now);
		expect(days).toHaveLength((ACTIVITY_WEEKS - 1) * 7 + 3);
	});

	it('counts added cards and answers by local day', async () => {
		// 23 h 30 à Zurich le 5 : encore le 5 ; 0 h 30 le 7 : déjà le 7.
		await cardAnswered(alice, new Date('2026-01-05T22:30:00Z'), [
			new Date('2026-01-05T22:40:00Z'),
			new Date('2026-01-06T23:30:00Z')
		]);
		await cardAnswered(alice, new Date('2026-01-06T09:00:00Z'), [new Date('2026-01-06T09:05:00Z')]);

		expect(byDate(await activity.daily(alice, now, { weeks: 2 }))).toEqual({
			'2026-01-05': [1, 1],
			'2026-01-06': [1, 1],
			'2026-01-07': [0, 1]
		});
	});

	it('leaves out what falls outside the window', async () => {
		// Le 28 décembre à 23 h 59 à Zurich, la veille du premier jour.
		await cardAnswered(alice, new Date('2025-12-28T22:59:00Z'), [
			new Date('2025-12-28T22:59:30Z'),
			new Date('2025-12-28T23:00:00Z')
		]);

		expect(byDate(await activity.daily(alice, now, { weeks: 2 }))).toEqual({
			'2025-12-29': [0, 1]
		});
	});

	it('drops deleted cards from additions but keeps their answers', async () => {
		const card = await cardAnswered(alice, new Date('2026-01-06T09:00:00Z'), [
			new Date('2026-01-06T09:05:00Z')
		]);
		await cards.softDelete(alice, card.id);

		expect(byDate(await activity.daily(alice, now, { weeks: 2 }))).toEqual({
			'2026-01-06': [0, 1]
		});
	});

	it("keeps to the owner's cards, and to one deck when asked", async () => {
		const other = (await createDeck(db, alice, SUBJECT_DECK)).id;
		await cardAnswered(alice, new Date('2026-01-05T09:00:00Z'), [], aliceDeck);
		await cardAnswered(
			alice,
			new Date('2026-01-06T09:00:00Z'),
			[new Date('2026-01-06T09:05:00Z')],
			other
		);
		await cardAnswered(bob, new Date('2026-01-06T09:00:00Z'), [new Date('2026-01-06T09:05:00Z')]);

		expect(byDate(await activity.daily(alice, now, { weeks: 2 }))).toEqual({
			'2026-01-05': [1, 0],
			'2026-01-06': [1, 1]
		});
		expect(byDate(await activity.daily(alice, now, { weeks: 2, deckId: other }))).toEqual({
			'2026-01-06': [1, 1]
		});
	});
});
