import { describe, expect, it } from 'vitest';
import { calendarDaysBetween, formatRelative, startOfDay, startOfNextDay } from './time';

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

describe('startOfDay', () => {
	it('returns the Zurich midnight that starts the day, shifted by whole days', () => {
		const now = new Date('2026-01-05T08:00:00Z');
		expect(startOfDay(now)).toEqual(new Date('2026-01-04T23:00:00Z'));
		expect(startOfDay(now, 2)).toEqual(new Date('2026-01-06T23:00:00Z'));
	});

	it('follows the change to summer time', () => {
		// Passage à l'heure d'été dans la nuit du 28 au 29 mars 2026
		const now = new Date('2026-03-28T12:00:00Z');
		expect(startOfDay(now, 1)).toEqual(new Date('2026-03-28T23:00:00Z'));
		expect(startOfDay(now, 2)).toEqual(new Date('2026-03-29T22:00:00Z'));
	});
});

describe('calendarDaysBetween', () => {
	it('counts Zurich calendar days, not 24-hour spans', () => {
		const lateEvening = new Date('2026-01-05T22:00:00Z'); // 23:00 à Zurich
		expect(calendarDaysBetween(lateEvening, new Date('2026-01-05T22:50:00Z'))).toBe(0);
		expect(calendarDaysBetween(lateEvening, new Date('2026-01-05T23:10:00Z'))).toBe(1);
		expect(calendarDaysBetween(lateEvening, new Date('2026-01-15T06:00:00Z'))).toBe(10);
	});

	it('is negative in the past', () => {
		const now = new Date('2026-01-05T08:00:00Z');
		expect(calendarDaysBetween(now, new Date('2026-01-04T23:30:00Z'))).toBe(0);
		expect(calendarDaysBetween(now, new Date('2026-01-04T08:00:00Z'))).toBe(-1);
	});
});

describe('formatRelative', () => {
	const now = new Date('2026-01-05T08:00:00Z');
	const after = (ms: number) => new Date(now.getTime() + ms);
	const MINUTE = 60_000;
	const HOUR = 60 * MINUTE;
	const DAY = 24 * HOUR;

	it('says « maintenant » within a minute, in either direction', () => {
		expect(formatRelative(now, now)).toBe('maintenant');
		expect(formatRelative(after(40_000), now)).toBe('maintenant');
		expect(formatRelative(after(-40_000), now)).toBe('maintenant');
	});

	it('uses the largest fitting unit', () => {
		expect(formatRelative(after(MINUTE), now)).toBe('dans 1 minute');
		expect(formatRelative(after(10 * MINUTE), now)).toBe('dans 10 minutes');
		expect(formatRelative(after(5 * HOUR), now)).toBe('dans 5 heures');
		expect(formatRelative(after(3 * DAY), now)).toBe('dans 3 jours');
		expect(formatRelative(after(60 * DAY), now)).toBe('dans 2 mois');
		expect(formatRelative(after(800 * DAY), now)).toBe('dans 2 ans');
	});

	it('rounds up to the next unit instead of saying « 60 minutes »', () => {
		expect(formatRelative(after(59.6 * MINUTE), now)).toBe('dans 1 heure');
		expect(formatRelative(after(23.6 * HOUR), now)).toBe('dans 1 jour');
	});

	it('describes past dates', () => {
		expect(formatRelative(after(-2 * HOUR), now)).toBe('il y a 2 heures');
	});
});
