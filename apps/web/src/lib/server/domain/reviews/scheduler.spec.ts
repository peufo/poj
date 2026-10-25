import { describe, expect, it } from 'vitest';
import {
	applyRating,
	capRating,
	emptyState,
	fromFsrsCard,
	parseState,
	previewDue,
	serializeState,
	toFsrsCard,
	type FsrsState
} from './scheduler';

const now = new Date('2026-01-05T08:00:00Z');
const minutes = (state: FsrsState) => (state.due.getTime() - now.getTime()) / 60_000;

/** Fait passer une révision neuve en état `review` (deux `good` successifs). */
function graduated(): FsrsState {
	const learning = applyRating(emptyState(now), 'good', now, { hintUsed: false }).state;
	return applyRating(learning, 'good', learning.due, { hintUsed: false }).state;
}

describe('scheduler', () => {
	it('creates a new state due immediately', () => {
		const state = emptyState(now);

		expect(state.state).toBe('new');
		expect(state.due).toEqual(now);
		expect(state.reps).toBe(0);
		expect(state.lastReview).toBeNull();
	});

	it('brings a failed card back within minutes, in the same session', () => {
		const { state, rating } = applyRating(emptyState(now), 'again', now, { hintUsed: false });

		expect(rating).toBe('again');
		expect(state.state).toBe('learning');
		expect(minutes(state)).toBeLessThanOrEqual(10);
		expect(state.lastReview).toEqual(now);
	});

	it('schedules a graduated card days ahead', () => {
		const state = graduated();

		expect(state.state).toBe('review');
		expect(state.scheduledDays).toBeGreaterThanOrEqual(1);
		expect(state.reps).toBe(2);
	});

	it('pushes an easy answer further than a good one', () => {
		const start = graduated();
		const at = start.due;
		const good = applyRating(start, 'good', at, { hintUsed: false }).state;
		const easy = applyRating(start, 'easy', at, { hintUsed: false }).state;

		expect(easy.due.getTime()).toBeGreaterThan(good.due.getTime());
	});

	it('caps good and easy at hard after a hint', () => {
		expect(capRating('good', true)).toBe('hard');
		expect(capRating('easy', true)).toBe('hard');
		expect(capRating('hard', true)).toBe('hard');
		expect(capRating('again', true)).toBe('again');
		expect(capRating('easy', false)).toBe('easy');

		const withHint = applyRating(graduated(), 'easy', now, { hintUsed: true });
		expect(withHint.rating).toBe('hard');
	});

	it('previews the due date of each rating, as applying it would give', () => {
		const start = graduated();
		const at = start.due;
		const preview = previewDue(start, at);

		for (const rating of ['again', 'hard', 'good', 'easy'] as const) {
			expect(preview[rating]).toEqual(
				applyRating(start, rating, at, { hintUsed: false }).state.due
			);
		}
		expect(preview.again.getTime()).toBeLessThan(preview.good.getTime());
	});

	it('round-trips a state through ts-fsrs and JSON without loss', () => {
		const state = graduated();

		expect(fromFsrsCard(toFsrsCard(state))).toEqual(state);
		expect(parseState(JSON.parse(JSON.stringify(serializeState(state))))).toEqual(state);
		expect(parseState(serializeState(emptyState(now)))).toEqual(emptyState(now));
	});
});
