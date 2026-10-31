import { describe, expect, it } from 'vitest';
import { e2eDatabaseName, e2eDatabasePid, isProcessAlive } from './e2e';

describe('e2e database', () => {
	it('is named after the Playwright runner', () => {
		expect(e2eDatabaseName(4242)).toBe('poj_e2e_4242');
		expect(e2eDatabasePid('poj_e2e_4242')).toBe(4242);
		for (const name of ['poj_e2e_', 'poj_e2e_x1', 'poj_test', 'poj_e2e_1_wt_a']) {
			expect(e2eDatabasePid(name)).toBeNull();
		}
	});

	it('tells a running process from a finished one', () => {
		expect(isProcessAlive(process.pid)).toBe(true);
		// Au-delà du plus grand pid possible sous Linux et macOS.
		expect(isProcessAlive(2 ** 22 + 1)).toBe(false);
	});
});
