import { describe, expect, it } from 'vitest';
import { startOfNextDay } from './time';

describe('startOfNextDay', () => {
	it('returns the next Zurich midnight in winter (UTC+1)', () => {
		expect(startOfNextDay(new Date('2026-01-05T08:00:00Z'))).toEqual(
			new Date('2026-01-05T23:00:00Z')
		);
	});

	it('returns the next Zurich midnight in summer (UTC+2)', () => {
		expect(startOfNextDay(new Date('2026-07-05T08:00:00Z'))).toEqual(
			new Date('2026-07-05T22:00:00Z')
		);
	});

	it('uses the local date, not the UTC one, late in the evening', () => {
		// 23:30 UTC le 5 janvier = 00:30 le 6 à Zurich
		expect(startOfNextDay(new Date('2026-01-05T23:30:00Z'))).toEqual(
			new Date('2026-01-06T23:00:00Z')
		);
	});
});
