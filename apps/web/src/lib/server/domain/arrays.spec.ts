import { describe, expect, it } from 'vitest';
import { at } from './arrays';

describe('at', () => {
	it('returns the item at the index', () => {
		expect(at(['a', 'b', 'c'], 1)).toBe('b');
	});

	it('keeps falsy items', () => {
		expect(at([0, null, ''], 0)).toBe(0);
		expect(at([0, null, ''], 1)).toBeNull();
	});

	it('throws a RangeError out of bounds', () => {
		expect(() => at(['a'], 1)).toThrow(RangeError);
		expect(() => at(['a'], -1)).toThrow(RangeError);
	});
});
