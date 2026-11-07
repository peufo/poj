import { describe, expect, it } from 'vitest';
import {
	BELT_END_MS,
	BELT_STOPS,
	DEFAULT_STOP,
	MARK_SIZES,
	beltPosition,
	cardsByStop,
	forecastPath,
	formatRate,
	layoutMarks,
	layoutPile,
	markPaths,
	nearestStop,
	pilePath,
	rateAt,
	stopAt,
	type MarkToken
} from './belt';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('beltPosition', () => {
	it('spreads delays on a log axis, from one minute to two years', () => {
		expect(beltPosition(MINUTE)).toBe(0);
		expect(beltPosition(BELT_END_MS)).toBe(1);
		// Une décade de plus, la même distance : 1 min → 10 min comme 10 min → 100 min.
		const decade = beltPosition(10 * MINUTE);
		expect(beltPosition(100 * MINUTE)).toBeCloseTo(2 * decade);
		expect(beltPosition(HOUR)).toBeCloseTo(Math.log(60) / Math.log(BELT_END_MS / MINUTE));
		expect(beltPosition(DAY)).toBeCloseTo(Math.log(1440) / Math.log(BELT_END_MS / MINUTE));
	});

	it('keeps imminent and very distant cards at the ends', () => {
		expect(beltPosition(0)).toBe(0);
		expect(beltPosition(20_000)).toBe(0);
		expect(beltPosition(10 * BELT_END_MS)).toBe(1);
	});

	it('increases with the delay', () => {
		const delays = [MINUTE, 5 * MINUTE, HOUR, DAY, 7 * DAY, 30 * DAY, 365 * DAY];
		const positions = delays.map(beltPosition);
		expect(positions).toEqual([...positions].sort((a, b) => a - b));
		expect(new Set(positions).size).toBe(delays.length);
	});
});

describe('stops', () => {
	it('run from a few minutes to the end of the axis, in order', () => {
		const delays = BELT_STOPS.map((s) => s.delayMs);
		expect(delays).toEqual([...delays].sort((a, b) => a - b));
		expect(BELT_STOPS.at(-1)).toMatchObject({ delayMs: BELT_END_MS, label: '2 ans +' });
		expect(BELT_STOPS.filter((s) => s.major).map((s) => s.label)).toEqual([
			'1 h',
			'1 j',
			'7 j',
			'30 j',
			'1 an'
		]);
		expect(stopAt(DEFAULT_STOP).label).toBe('1 j');
		expect(() => stopAt(BELT_STOPS.length)).toThrow(RangeError);
	});

	it('catch the nearest stop of a position', () => {
		expect(stopAt(nearestStop(beltPosition(7 * DAY))).label).toBe('7 j');
		expect(stopAt(nearestStop(beltPosition(6.5 * DAY))).label).toBe('7 j');
		expect(nearestStop(-1)).toBe(0);
		expect(nearestStop(2)).toBe(BELT_STOPS.length - 1);
	});

	it('count the ready cards and those of the belt up to each stop', () => {
		const positions = [HOUR, 3 * DAY, 7 * DAY, 40 * DAY, 3 * 365 * DAY].map(beltPosition);
		const counts = cardsByStop(positions, 4);
		const upTo = (label: string) => counts[BELT_STOPS.findIndex((s) => s.label === label)];

		expect(counts).toHaveLength(BELT_STOPS.length);
		expect(counts[0]).toBe(4);
		expect(upTo('1 h')).toBe(4 + 1);
		expect(upTo('7 j')).toBe(4 + 3);
		expect(counts.at(-1)).toBe(4 + 5);
		expect(cardsByStop([], 0).every((n) => n === 0)).toBe(true);
	});
});

const at = (delayMs: number, level: MarkToken['level'] = 2): MarkToken => ({
	position: beltPosition(delayMs),
	level
});

describe('layoutMarks', () => {
	it('draws each card as a mark, at the largest size that fits', () => {
		const tokens = [at(DAY, 1), at(DAY, 3), at(30 * DAY)];
		const layout = layoutMarks(tokens, 300);

		expect(layout).toMatchObject({ size: MARK_SIZES[0], step: 6, overlap: false });
		expect(layout.columns).toHaveLength(Math.floor(300 / 7));
		const total = layout.columns.flat().reduce((sum, n) => sum + n, 0);
		expect(total).toBe(tokens.length);
		expect(layout.columns.find((c) => c[1] === 1 && c[3] === 1)).toBeDefined();
	});

	it('shrinks the marks for a dense column, then lets them overlap', () => {
		const dense = Array.from({ length: 20 }, () => at(DAY));
		expect(layoutMarks(dense, 300).size).toEqual(MARK_SIZES[2]);

		const packed = Array.from({ length: 100 }, () => at(DAY));
		const layout = layoutMarks(packed, 300);
		expect(layout).toMatchObject({ size: MARK_SIZES.at(-1), overlap: true });
		expect(layout.step * 100).toBeCloseTo(72);
	});

	it('stacks the most solid marks at the bottom, one path per level', () => {
		const layout = layoutMarks([at(DAY, 0), at(DAY, 3)], 300);
		const [fresh, , , solid] = markPaths(layout, 18, 72);
		// Marque de 6 × 5, au pas de 6 : la solide repose sur la ligne, la neuve au-dessus.
		expect(solid).toMatch(/^M\d+ 67h6v5h-6z$/);
		expect(fresh).toMatch(/^M\d+ 61h6v5h-6z$/);
	});

	it('merges the marks of a level into one block when they overlap', () => {
		const layout = layoutMarks(
			Array.from({ length: 100 }, () => at(DAY, 2)),
			300
		);
		const paths = markPaths(layout, 0, 72);
		expect(paths[2].match(/M/g)).toHaveLength(1);
		expect(paths[2]).toMatch(/ 0h2v72h-2z$/);
	});
});

describe('layoutPile', () => {
	it('fills a box with the largest marks that fit, then draws only what fits', () => {
		expect(layoutPile(10, 20, 44)).toMatchObject({
			size: MARK_SIZES[0],
			columns: 3,
			marks: 10
		});
		expect(layoutPile(40, 20, 44).size).toEqual(MARK_SIZES[1]);
		const full = layoutPile(5000, 20, 44);
		expect(full.size).toEqual(MARK_SIZES.at(-1));
		expect(full.marks).toBeLessThan(5000);
	});

	it('piles the marks from the bottom left', () => {
		const path = pilePath(layoutPile(2, 20, 44), 44);
		expect(path).toBe('M0 39h6v5h-6zM7 39h6v5h-6z');
		expect(pilePath(layoutPile(1, 20, 44), 44, { outline: true })).toBe('M0.5 39.5h5v4h-5z');
	});
});

describe('forecast curve', () => {
	const points = [
		{ position: 0, perDay: 100 },
		{ position: 0.5, perDay: 25 },
		{ position: 1, perDay: 0 }
	];

	it('reads the estimate of the nearest point', () => {
		expect(rateAt(points, 0.1)).toBe(100);
		expect(rateAt(points, 0.6)).toBe(25);
		expect(rateAt([], 0.5)).toBe(0);
	});

	it('scales the curve on its own peak, by square root', () => {
		// Pic à 100 : pleine hauteur ; 25, la moitié (racine de 1/4) ; 0, sur la ligne.
		expect(forecastPath(points, 18, 200, 70, 60)).toBe('M18 10L118 40L218 70');
		expect(forecastPath([{ position: 0, perDay: 0 }], 18, 200, 70, 60)).toBe('');
	});

	it('rounds a pace to what it is worth', () => {
		expect(formatRate(104.6)).toBe('105');
		expect(formatRate(2.4)).toBe('2');
		expect(formatRate(0.34)).toBe('0,3');
		expect(formatRate(0.01)).toBe('0');
	});
});
