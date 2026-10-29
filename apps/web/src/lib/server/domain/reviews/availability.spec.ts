import { describe, expect, it } from 'vitest';
import { presentations, type ReviewSlot } from './availability';

const now = new Date('2026-01-05T08:00:00Z');
const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000);

function slot(
	id: string,
	direction: ReviewSlot['direction'],
	due: Date,
	lastReview: Date | null = null,
	cardId = 'card'
): ReviewSlot {
	return { id, cardId, direction, due, lastReview };
}

describe('presentations', () => {
	it('presents one direction of a fresh card now, the other 24 hours later', () => {
		const result = presentations([slot('b', 'a_to_b', now), slot('a', 'b_to_a', now)], now);

		expect(result.get('a')).toEqual({ buriedUntil: null, at: now });
		expect(result.get('b')).toEqual({ buriedUntil: null, at: at(24) });
	});

	it('presents the most overdue direction first', () => {
		const result = presentations([slot('a', 'a_to_b', at(-1)), slot('b', 'b_to_a', at(-48))], now);

		expect(result.get('b')!.at).toEqual(at(-48));
		expect(result.get('a')!.at).toEqual(at(24));
	});

	it('defers a buried direction to the end of its burial, while still due', () => {
		const result = presentations(
			[slot('a', 'a_to_b', at(200), at(-2)), slot('b', 'b_to_a', at(-1))],
			now
		);

		expect(result.get('b')).toEqual({ buriedUntil: at(22), at: at(22) });
		expect(result.get('a')).toEqual({ buriedUntil: null, at: at(200) });
	});

	it('ignores a burial that ends before the due date, or has already ended', () => {
		const result = presentations(
			[
				slot('a', 'a_to_b', at(100), at(-2)),
				slot('b', 'b_to_a', at(30)),
				slot('c', 'a_to_b', at(-1), at(-30), 'other'),
				slot('d', 'b_to_a', at(50), null, 'other')
			],
			now
		);

		expect(result.get('b')).toEqual({ buriedUntil: null, at: at(30) });
		expect(result.get('a')).toEqual({ buriedUntil: null, at: at(100) });
		expect(result.get('c')).toEqual({ buriedUntil: null, at: at(-1) });
		expect(result.get('d')).toEqual({ buriedUntil: null, at: at(50) });
	});

	it('pushes the second direction 24 hours after the first, even in the future', () => {
		const result = presentations([slot('a', 'a_to_b', at(48)), slot('b', 'b_to_a', at(50))], now);

		expect(result.get('a')!.at).toEqual(at(48));
		expect(result.get('b')!.at).toEqual(at(72));
	});
});
