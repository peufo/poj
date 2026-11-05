import { describe, expect, it } from 'vitest';
import { hintOf } from './hint';

describe('hintOf', () => {
	it('keeps a context without source as it is', () => {
		expect(hintOf('Réunion budget, avec Paul')).toBe('Réunion budget, avec Paul');
		expect(hintOf(null)).toBeNull();
	});

	it('drops the source lines, which may name the answer', () => {
		expect(hintOf('Vu en cours\nSource : fr.wikipedia.org/wiki/Canberra, 2026-11-01')).toBe(
			'Vu en cours'
		);
		expect(hintOf('Sources: Wikipédia (Canberra), 2026')).toBeNull();
	});

	it('drops a source written inline, with its separator', () => {
		expect(hintOf('Quiz du jeudi — source : Canberra.gov.au')).toBe('Quiz du jeudi');
		expect(hintOf('Quiz du jeudi (Source : Canberra)')).toBe('Quiz du jeudi');
	});

	it('leaves words that merely contain « source » alone', () => {
		expect(hintOf('Ressource : le manuel')).toBe('Ressource : le manuel');
	});
});
