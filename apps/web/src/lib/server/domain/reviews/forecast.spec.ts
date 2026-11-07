import { fsrs, Rating } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import { beltPosition } from '../../../format/belt';
import { DAY } from '../time';
import {
	FORECAST_HORIZON_MS,
	FORECAST_POINTS,
	forecast,
	forecastDelays,
	type ForecastSense
} from './forecast';
import { splitNewCards } from './new-cards';
import { emptyState, simulateReviews, TARGET_RETENTION, toFsrsCard } from './scheduler';

const now = new Date('2026-01-05T08:00:00Z');
const later = (ms: number) => new Date(now.getTime() + ms);
const HOUR = 60 * 60 * 1000;

/** Un sens neuf, présenté à `start`. */
const fresh = (id: string, start = now): ForecastSense => ({ id, state: emptyState(now), start });

describe('simulateReviews', () => {
	it('chains the scheduler without fuzz, answering good at each due date', () => {
		const until = later(2 * 365 * DAY);
		const expected: Date[] = [];
		const scheduler = fsrs({ request_retention: TARGET_RETENTION, enable_fuzz: false });
		let card = toFsrsCard(emptyState(now));
		for (let at = now; at < until; at = card.due) {
			expected.push(at);
			card = scheduler.next(card, at, Rating.Good).card;
		}

		expect(simulateReviews(emptyState(now), now, until, () => false)).toEqual(expected);
		expect(expected.length).toBeGreaterThan(3);
	});

	it('brings a card back sooner when it is forgotten', () => {
		const until = later(2 * 365 * DAY);
		const remembered = simulateReviews(emptyState(now), now, until, () => false);
		const forgotten = simulateReviews(emptyState(now), now, until, () => true);
		expect(forgotten.length).toBeGreaterThan(remembered.length);
	});
});

describe('forecast', () => {
	it('gives one point per step of the belt axis, up to two years', () => {
		const delays = forecastDelays();
		expect(delays).toHaveLength(FORECAST_POINTS);
		expect(delays.at(-1)).toBeCloseTo(FORECAST_HORIZON_MS);
		// Les points tombent à intervalles réguliers sur l'axe du tapis.
		delays.forEach((delay, i) => {
			expect(beltPosition(delay)).toBeCloseTo(i / (FORECAST_POINTS - 1));
		});
	});

	it('is the same from one call to the next', () => {
		const senses = [fresh('a'), fresh('b', later(3 * DAY))];
		expect(forecast(senses, now)).toEqual(forecast(senses, now));
	});

	it('gives the pace of the coming day before twelve hours, flat', () => {
		const points = forecast([fresh('a')], now);
		const firstDay = points.filter((p) => p.delayMs < 12 * HOUR);
		expect(firstDay.length).toBeGreaterThan(10);
		expect(new Set(firstDay.map((p) => p.perDay)).size).toBe(1);
		// Une carte neuve : sa présentation, puis les étapes d'apprentissage de la journée.
		const { length: today } = simulateReviews(emptyState(now), now, later(DAY), () => false);
		expect(firstDay[0]?.perDay).toBeCloseTo(today);
	});

	it('brings each direction back, again and again, over two years', () => {
		const points = forecast([fresh('a')], now);
		const spread = points.filter((p) => p.delayMs > 30 * DAY && p.perDay > 0);
		expect(spread.length).toBeGreaterThan(5);
	});

	it('adds up the directions of each card', () => {
		const one = forecast([fresh('a')], now);
		const both = forecast([fresh('a'), fresh('b')], now);
		// Avant toute révision en phase de révision, rien n'est tiré au sort : le compte double.
		both
			.filter((point) => point.delayMs < DAY)
			.forEach((point, i) => {
				expect(point.perDay).toBeCloseTo(2 * (one[i]?.perDay ?? 0));
			});
		// Au-delà, les tirages diffèrent, mais le total reste du même ordre.
		const total = (points: typeof one) => points.reduce((sum, p) => sum + p.perDay, 0);
		expect(total(both) / total(one)).toBeGreaterThan(1.7);
		expect(total(both) / total(one)).toBeLessThan(2.3);
	});

	it('counts an overdue direction now, and a later one only from its start', () => {
		const overdue = forecast([fresh('a', later(-3 * DAY))], now);
		expect(overdue).toEqual(forecast([fresh('a')], now));

		const inAWeek = forecast([fresh('a', later(7 * DAY))], now);
		expect(inAWeek.filter((p) => p.delayMs < 4 * DAY).every((p) => p.perDay === 0)).toBe(true);
		expect(inAWeek.some((p) => p.perDay > 0)).toBe(true);
	});

	it('is flat at zero without directions', () => {
		const points = forecast([], now);
		expect(points).toHaveLength(FORECAST_POINTS);
		expect(points.every((p) => p.perDay === 0)).toBe(true);
	});

	it('simulates a sample of a large deck, scaled back to its size', () => {
		const deck = Array.from({ length: 6000 }, (_, i) => fresh('same', later(i)));
		const [first] = forecast(deck, now);
		const [single] = forecast([fresh('same')], now);
		expect(first?.perDay).toBeCloseTo(6000 * (single?.perDay ?? 0), 0);
	});
});

describe('splitNewCards', () => {
	it('lets the waiting cards of each deck in at the pace of its daily limit', () => {
		const cards = [
			{ id: 'a1', deckId: 'a' },
			{ id: 'b1', deckId: 'b' },
			{ id: 'a2', deckId: 'a' },
			{ id: 'a3', deckId: 'a' },
			{ id: 'a4', deckId: 'a' },
			{ id: 'b2', deckId: 'b' }
		];
		// Une place aujourd'hui dans chaque deck ; ensuite deux par jour pour `a`, une pour `b`.
		const { released, held, releaseDays } = splitNewCards(
			cards,
			() => 1,
			(deckId) => (deckId === 'a' ? 2 : 1)
		);

		expect(released).toEqual(['a1', 'b1']);
		expect(held).toEqual(['a2', 'a3', 'a4', 'b2']);
		expect(releaseDays).toEqual(
			new Map([
				['a2', 1],
				['a3', 1],
				['a4', 2],
				['b2', 1]
			])
		);
	});
});
