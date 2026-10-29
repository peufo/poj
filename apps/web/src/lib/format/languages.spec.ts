import { describe, expect, it } from 'vitest';
import { DECK_LANGUAGES, isDeckLanguage, languageOption, languageOptions } from './languages';

describe('deck languages', () => {
	it('offers English and Portuguese with the variant DeepL needs as a target', () => {
		expect(DECK_LANGUAGES).toEqual(expect.arrayContaining(['en-GB', 'en-US', 'pt-BR', 'pt-PT']));
		expect(isDeckLanguage('en')).toBe(false);
		expect(isDeckLanguage('pt')).toBe(false);
		expect(isDeckLanguage('fr')).toBe(true);
	});

	it('names each language in French, variant included, in alphabetical order', () => {
		expect(languageOption('fr')).toBe('Français');
		expect(languageOption('en-GB')).toMatch(/^Anglais \(.+\)$/);
		expect(languageOption('en-GB')).not.toBe(languageOption('en-US'));
		const labels = languageOptions.map((o) => o.label);
		expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'fr')));
		expect(labels).toHaveLength(DECK_LANGUAGES.length);
	});
});
