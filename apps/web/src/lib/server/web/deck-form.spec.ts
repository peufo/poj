import { describe, expect, it } from 'vitest';
import { NEW_DECK_VALUES } from '#lib/format/decks.js';
import { deckFormValues } from './deck-form';

describe('new deck form values', () => {
	it('defaults to a language deck read in both directions', () => {
		expect(NEW_DECK_VALUES).toMatchObject({ kind: 'language', bothDirections: true });
	});
});

describe('deck edit form values', () => {
	const saved = {
		id: 'd1',
		ownerId: 'u1',
		name: 'Capitales',
		kind: 'subject',
		languageA: null,
		languageB: null,
		labelA: null,
		labelB: 'Capitale',
		bothDirections: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		deletedAt: null
	} as const;

	it('starts from the saved deck, a subject without labels showing the defaults', () => {
		expect(deckFormValues(saved)).toEqual({
			name: 'Capitales',
			kind: 'subject',
			languageA: '',
			languageB: '',
			labelA: 'Question',
			labelB: 'Capitale',
			bothDirections: false
		});
	});
});
