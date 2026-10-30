import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../testing/db';
import { createDeck, createUser, SUBJECT_DECK } from '../../testing/factories';
import { createReviewsService } from '../reviews/reviews.service';
import { createCardsService } from './cards.service';
import { createDailyGoalService, DEFAULT_DAILY_GOAL, streaksOf } from './daily-goal.service';
import type { GoalDay } from './types';

const db = useTestDatabase();
const goals = createDailyGoalService(db);
const cards = createCardsService(db);
const reviews = createReviewsService(db);

const DAY = 24 * 60 * 60 * 1000;
// Lundi 12 janvier 2026, 11:00 à Zurich (UTC+1).
const now = new Date('2026-01-12T10:00:00Z');
/** Le même moment, `n` jours plus tôt (pas de changement d'heure en janvier). */
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);

let alice: string;
let bob: string;

/** `n` cartes créées à l'instant `at`, dans le premier deck du propriétaire (créé au besoin). */
async function addCards(ownerId: string, at: Date, n = 1) {
	const { id: deckId } =
		(await db.deck.findFirst({ where: { ownerId } })) ?? (await createDeck(db, ownerId));
	for (let i = 0; i < n; i += 1) {
		await db.card.create({
			data: { ownerId, deckId, sideA: `a ${i}`, sideB: `b ${i}`, origin: 'web', createdAt: at }
		});
	}
}

/**
 * `n` cartes créées par le service à l'instant `at` (une révision neuve, due aussitôt), dans
 * un deck de sujet à sens unique.
 */
async function addReviewable(ownerId: string, at: Date, n = 2): Promise<string[]> {
	const { id: deckId } =
		(await db.deck.findFirst({ where: { ownerId, kind: 'subject' } })) ??
		(await createDeck(db, ownerId, SUBJECT_DECK));
	const ids: string[] = [];
	for (let i = 0; i < n; i += 1) {
		const card = await cards.create(
			ownerId,
			deckId,
			{ sideA: `q ${at.toISOString()} ${i}`, sideB: 'r' },
			'web',
			at
		);
		await db.card.update({ where: { id: card.id }, data: { createdAt: at } });
		ids.push(card.id);
	}
	return ids;
}

/** Répond Easy (la carte s'éloigne de plusieurs jours) à chacune des cartes, à l'instant `at`. */
async function answerAll(ownerId: string, cardIds: string[], at: Date) {
	for (const cardId of cardIds) {
		const review = await db.review.findFirstOrThrow({ where: { cardId } });
		await reviews.answer(ownerId, review.id, { rating: 'easy', version: 'new', origin: 'web' }, at);
	}
}

/** Jours réussis, du plus ancien à aujourd'hui, en 1 / 0. */
const reachedOf = (days: GoalDay[]) => days.map((d) => (d.add.reached ? 1 : 0));

beforeEach(async () => {
	alice = await createUser(db, 'Alice');
	bob = await createUser(db, 'Bob');
});

describe('progress', () => {
	it('starts empty, with the default goal', async () => {
		const progress = await goals.progress(alice, now, 7);
		expect(progress.goal).toBe(DEFAULT_DAILY_GOAL);
		expect(progress.today.add).toEqual({ count: 0, goal: 2, reached: false });
		expect(progress.streak).toBe(0);
		expect(progress.days).toHaveLength(7);
		expect(progress.days[0].date).toEqual(new Date('2026-01-05T23:00:00Z')); // mardi 6, minuit
		expect(progress.days[6]).toBe(progress.today);
		expect(progress.today.date).toEqual(new Date('2026-01-11T23:00:00Z')); // lundi 12, minuit
	});

	it('counts the cards created each day and judges them against the goal', async () => {
		await addCards(alice, daysAgo(2), 3);
		await addCards(alice, daysAgo(1), 1);
		await addCards(alice, now, 2);

		const { days, today } = await goals.progress(alice, now, 4);
		expect(days.map((d) => d.add.count)).toEqual([0, 3, 1, 2]);
		expect(reachedOf(days)).toEqual([0, 1, 0, 1]);
		expect(today.add).toEqual({ count: 2, goal: 2, reached: true });
	});

	it("ignores other users' cards", async () => {
		await addCards(bob, now, 2);
		const { today, streak } = await goals.progress(alice, now, 1);
		expect(today.add.count).toBe(0);
		expect(streak).toBe(0);
	});

	it('counts deleted cards on the day they were created', async () => {
		await addCards(alice, daysAgo(1), 2);
		const [card] = await db.card.findMany({ where: { ownerId: alice } });
		await cards.softDelete(alice, card.id);

		const { days, streak } = await goals.progress(alice, now, 2);
		expect(days[0].add).toMatchObject({ count: 2, reached: true });
		expect(streak).toBe(1);
	});

	describe('streak', () => {
		it('tolerates one missed day, without counting it', async () => {
			await addCards(alice, daysAgo(3), 2);
			await addCards(alice, daysAgo(1), 2);
			await addCards(alice, now, 2);

			const { streak } = await goals.progress(alice, now, 7);
			expect(streak).toBe(3);
		});

		it('stops at two missed days in a row', async () => {
			await addCards(alice, daysAgo(5), 2);
			await addCards(alice, daysAgo(4), 2);
			await addCards(alice, daysAgo(1), 2);

			const { streak } = await goals.progress(alice, now, 7);
			expect(streak).toBe(1);
		});

		it('does not count a day below the goal as reached', async () => {
			await addCards(alice, daysAgo(2), 2);
			await addCards(alice, daysAgo(1), 1);

			expect((await goals.progress(alice, now, 3)).streak).toBe(1);
			await addCards(alice, daysAgo(3), 1);
			expect((await goals.progress(alice, now, 3)).streak).toBe(1);
		});

		it('never counts today as missed while it is not over', async () => {
			await addCards(alice, daysAgo(1), 2);
			await addCards(alice, now, 1);

			const progress = await goals.progress(alice, now, 2);
			expect(progress.today.add).toMatchObject({ count: 1, reached: false });
			expect(progress.streak).toBe(1);

			await addCards(alice, now, 1);
			expect((await goals.progress(alice, now, 2)).streak).toBe(2);
		});

		it('survives a missed yesterday until today is over', async () => {
			await addCards(alice, daysAgo(2), 2);

			expect((await goals.progress(alice, now, 3)).streak).toBe(1);
			// Le lendemain, aujourd'hui (resté vide) est le second jour manqué.
			expect((await goals.progress(alice, daysAgo(-1), 3)).streak).toBe(0);
		});

		it('runs beyond the displayed period', async () => {
			for (let n = 0; n < 10; n += 1) await addCards(alice, daysAgo(n), 2);

			const { days, streak } = await goals.progress(alice, now, 3);
			expect(days).toHaveLength(3);
			expect(streak).toBe(10);
		});
	});

	describe('day boundaries in Europe/Zurich', () => {
		it('splits days at local midnight, not UTC midnight', async () => {
			// 23:30 à Zurich le dimanche 11 : hier. 00:30 à Zurich le lundi 12 : aujourd'hui.
			await addCards(alice, new Date('2026-01-11T22:30:00Z'), 1);
			await addCards(alice, new Date('2026-01-11T23:30:00Z'), 2);

			const { days } = await goals.progress(alice, now, 2);
			expect(days.map((d) => d.add.count)).toEqual([1, 2]);
		});

		it('follows the change to summer time', async () => {
			// Passage à l'heure d'été dans la nuit du 28 au 29 mars 2026.
			const monday = new Date('2026-03-30T10:00:00Z');
			await addCards(alice, new Date('2026-03-28T22:30:00Z'), 1); // samedi 28, 23:30
			await addCards(alice, new Date('2026-03-28T23:30:00Z'), 2); // dimanche 29, 00:30 (UTC+1)
			await addCards(alice, new Date('2026-03-29T21:30:00Z'), 1); // dimanche 29, 23:30 (UTC+2)
			await addCards(alice, new Date('2026-03-29T22:30:00Z'), 3); // lundi 30, 00:30

			const { days } = await goals.progress(alice, monday, 3);
			expect(days.map((d) => d.add.count)).toEqual([1, 3, 3]);
			expect(days.map((d) => d.date)).toEqual([
				new Date('2026-03-27T23:00:00Z'),
				new Date('2026-03-28T23:00:00Z'),
				new Date('2026-03-29T22:00:00Z')
			]);
		});
	});
});

describe('the Poj day', () => {
	/** Le jour `n` jours plus tôt à 10:00, avant les ajouts de 11:00. */
	const morningOf = (n: number) => new Date(daysAgo(n).getTime() - 60 * 60 * 1000);

	it('is full with both goals, partial with one, empty with none', async () => {
		const first = await addReviewable(alice, daysAgo(2));
		await answerAll(alice, first, morningOf(1));
		await addReviewable(alice, daysAgo(1), 1);
		await addReviewable(alice, now);

		const { days } = await goals.progress(alice, now, 4);
		// Sans ajout ni carte due ; rien de dû, mais l'ajout est fait ; à jour, mais une seule
		// carte ajoutée ; ajout fait, mais la carte d'hier n'a pas de réponse.
		expect(days.map((d) => d.level)).toEqual(['none', 'full', 'partial', 'partial']);
		expect(days.map((d) => d.review.due)).toEqual([0, 0, 2, 1]);
	});

	it('tolerates one day that is not full, and keeps the record', async () => {
		const added = [];
		for (let n = 4; n >= 0; n -= 1) added[n] = await addReviewable(alice, daysAgo(n));
		await answerAll(alice, added[4], morningOf(3));
		// Avant-hier, rien n'est révisé ; hier, tout le retard l'est.
		await answerAll(alice, [...added[3], ...added[2]], morningOf(1));

		let progress = await goals.progress(alice, now, 5);
		expect(progress.days.map((d) => d.level)).toEqual([
			'full',
			'full',
			'partial',
			'full',
			'partial'
		]);
		expect(progress).toMatchObject({ streak: 3, best: 3 });

		await answerAll(alice, added[1], now);
		progress = await goals.progress(alice, now, 5);
		expect(progress.today.level).toBe('full');
		expect(progress).toMatchObject({ streak: 4, best: 4 });
	});

	it('stops the streak after two days that are not full', async () => {
		const added = [];
		for (let n = 4; n >= 0; n -= 1) added[n] = await addReviewable(alice, daysAgo(n));
		await answerAll(alice, added[4], morningOf(3));
		await answerAll(alice, [...added[3], ...added[2], ...added[1]], now);

		const progress = await goals.progress(alice, now, 5);
		expect(progress.days.map((d) => d.level)).toEqual([
			'full',
			'full',
			'partial',
			'partial',
			'full'
		]);
		expect(progress).toMatchObject({ streak: 1, best: 2 });
	});

	it('gives today alone, as the calendar does', async () => {
		const added = await addReviewable(alice, daysAgo(2));
		await answerAll(alice, added.slice(0, 1), morningOf(0));
		await addReviewable(alice, now, 1);

		const today = await goals.today(alice, now);
		expect(today).toEqual((await goals.progress(alice, now, 3)).today);
		expect(today).toMatchObject({
			add: { count: 1, goal: 2, reached: false },
			review: { due: 2, answered: 1, reached: false },
			level: 'none'
		});
	});
});

describe('streaksOf', () => {
	const of = (days: string) => streaksOf([...days].map((d) => d === 'x'));

	it('counts full days, tolerating one miss', () => {
		expect(of('')).toEqual({ streak: 0, best: 0 });
		expect(of('xx.x')).toEqual({ streak: 3, best: 3 });
		expect(of('xx..x')).toEqual({ streak: 1, best: 2 });
	});

	it('never counts today as missed', () => {
		expect(of('xx.')).toEqual({ streak: 2, best: 2 });
		// Hier manqué : la série tient tant qu'aujourd'hui n'est pas fini.
		expect(of('x..')).toEqual({ streak: 1, best: 1 });
		expect(of('x...')).toEqual({ streak: 0, best: 1 });
	});
});

describe('goal', () => {
	it('is 2 until changed', async () => {
		expect(await goals.goal(alice, now)).toBe(2);
	});

	it('applies a new goal from today on, leaving past days judged by their own', async () => {
		await addCards(alice, daysAgo(3), 2);
		await addCards(alice, daysAgo(2), 2);
		await addCards(alice, daysAgo(1), 1);
		await addCards(alice, now, 1);

		await goals.setGoal(alice, 3, daysAgo(2));
		await goals.setGoal(alice, 1, now);

		const progress = await goals.progress(alice, now, 4);
		expect(progress.days.map((d) => d.add.goal)).toEqual([2, 3, 3, 1]);
		expect(reachedOf(progress.days)).toEqual([1, 0, 0, 1]);
		expect(progress.goal).toBe(1);
		expect(await goals.goal(alice, now)).toBe(1);
		expect(await goals.goal(bob, now)).toBe(2);
	});

	it('replaces a change made earlier the same day', async () => {
		await goals.setGoal(alice, 5, now);
		await goals.setGoal(alice, 4, new Date(now.getTime() + 60 * 60 * 1000));

		expect(await goals.goal(alice, now)).toBe(4);
		expect(await db.dailyGoal.count({ where: { userId: alice } })).toBe(1);
	});
});
