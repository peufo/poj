import { describe, expect, it } from 'vitest';
import {
	activityLevel,
	activityThresholds,
	activityWeeks,
	formatActivityDate,
	type ActivityDay
} from './activity';

/** Jours consécutifs depuis `start` (`AAAA-MM-JJ`), avec ces totaux en révisions. */
function daysFrom(start: string, totals: number[]): ActivityDay[] {
	const first = new Date(`${start}T00:00:00Z`).getTime();
	return totals.map((reviewed, i) => ({
		date: new Date(first + i * 86_400_000).toISOString().slice(0, 10),
		added: 0,
		reviewed
	}));
}

describe('activity', () => {
	it('splits levels on the quartiles of active days', () => {
		const thresholds = activityThresholds([0, 1, 2, 3, 4, 5, 0, 100]);
		expect(thresholds).toEqual([2, 3, 4]);
		expect([0, 1, 2, 3, 4, 5, 100].map((t) => activityLevel(t, thresholds))).toEqual([
			0, 1, 1, 2, 3, 4, 4
		]);
	});

	it('gives the lowest level to every active day when they are all alike', () => {
		const thresholds = activityThresholds([7, 7, 7]);
		expect(activityLevel(7, thresholds)).toBe(1);
		expect(activityLevel(0, thresholds)).toBe(0);
	});

	it('counts additions and answers together', () => {
		const [week] = activityWeeks([
			{ date: '2026-01-05', added: 2, reviewed: 0 },
			{ date: '2026-01-06', added: 1, reviewed: 1 },
			{ date: '2026-01-07', added: 0, reviewed: 0 }
		]);
		expect(week?.days.map((day) => day?.level ?? null)).toEqual([1, 1, 0, null, null, null, null]);
	});

	it('cuts weeks from monday, leaves the coming days empty and marks month starts', () => {
		const weeks = activityWeeks(
			daysFrom(
				'2025-12-22',
				Array.from({ length: 17 }, () => 1)
			)
		);

		expect(weeks).toHaveLength(3);
		expect(weeks.map((week) => week.month)).toEqual([null, 'janv.', null]);
		expect(weeks[2]?.days.map((day) => day?.date ?? null)).toEqual([
			'2026-01-05',
			'2026-01-06',
			'2026-01-07',
			null,
			null,
			null,
			null
		]);
	});

	it('formats a day in full', () => {
		expect(formatActivityDate('2026-01-07')).toBe('mercredi 7 janvier 2026');
	});
});
