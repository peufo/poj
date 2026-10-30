import { describe, expect, it } from 'vitest';
import { NEW_DECK_VALUES } from '#lib/format/decks.js';
import { deckFormValues, readDeckEditForm, readNewDeckForm } from './deck-form';

/** Formulaire posté, comme le navigateur l'envoie (case cochée : présente). */
function formOf(fields: Record<string, string | boolean>) {
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		if (value === true) form.set(key, '1');
		else if (value !== false) form.set(key, value);
	}
	return form;
}

const language = {
	name: ' Anglais ',
	kind: 'language',
	languageA: 'fr',
	languageB: 'en-GB',
	// Les champs du sujet, masqués, sont postés quand même : ignorés.
	labelA: 'Question',
	labelB: 'Réponse',
	bothDirections: true
};

const subject = {
	name: 'Capitales',
	kind: 'subject',
	languageA: 'fr',
	languageB: '',
	labelA: ' Pays ',
	labelB: 'Capitale',
	bothDirections: false
};

describe('new deck form', () => {
	it('reads a language deck, without labels', () => {
		expect(readNewDeckForm(formOf(language)).input).toEqual({
			name: 'Anglais',
			kind: 'language',
			languageA: 'fr',
			languageB: 'en-GB',
			labelA: null,
			labelB: null,
			bothDirections: true
		});
	});

	it('reads a subject deck, without languages, empty labels meaning the defaults', () => {
		expect(readNewDeckForm(formOf(subject)).input).toEqual({
			name: 'Capitales',
			kind: 'subject',
			languageA: null,
			languageB: null,
			labelA: 'Pays',
			labelB: 'Capitale',
			bothDirections: false
		});
		expect(readNewDeckForm(formOf({ ...subject, labelA: ' ', labelB: '' })).input).toMatchObject({
			labelA: null,
			labelB: null
		});
	});

	it('requires a name and two different languages from the list', () => {
		const { errors, input, values } = readNewDeckForm(
			formOf({ ...language, name: '  ', languageB: 'en-US', languageA: 'en-GB' })
		);
		expect(input).toBeNull();
		expect(errors).toEqual({
			name: 'Le nom est obligatoire.',
			languageB: 'Choisis une autre langue que la langue connue.'
		});
		expect(values).toMatchObject({ kind: 'language', languageA: 'en-GB', bothDirections: true });

		expect(readNewDeckForm(formOf({ ...language, languageB: 'xx' })).errors).toEqual({
			languageB: 'Choisis une langue dans la liste.'
		});
		expect(readNewDeckForm(formOf({ ...language, languageB: '' })).errors).toHaveProperty(
			'languageB'
		);
	});

	it('limits the name and the labels', () => {
		const { errors } = readNewDeckForm(
			formOf({ ...subject, name: 'x'.repeat(61), labelB: 'x'.repeat(41) })
		);
		expect(errors).toEqual({ name: '60 caractères au plus.', labelB: '40 caractères au plus.' });
	});

	it('defaults to a language deck read in both directions', () => {
		expect(NEW_DECK_VALUES).toMatchObject({ kind: 'language', bothDirections: true });
		expect(readNewDeckForm(formOf({ ...language, kind: 'other' })).values.kind).toBe('language');
	});
});

describe('deck edit form', () => {
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

	it('updates the name, the directions and the labels of a subject', () => {
		expect(readDeckEditForm(formOf({ ...subject, bothDirections: true }), saved).input).toEqual({
			name: 'Capitales',
			labelA: 'Pays',
			labelB: 'Capitale',
			bothDirections: true
		});
	});

	it('keeps the kind and the languages of a language deck (its labels left to the service)', () => {
		const deck = { kind: 'language', languageA: 'fr', languageB: 'en-GB' } as const;
		const { input, values } = readDeckEditForm(
			formOf({ ...language, kind: 'subject', languageB: 'de' }),
			deck
		);
		expect(input).toMatchObject({ name: 'Anglais', bothDirections: true });
		expect(input).not.toHaveProperty('languageB');
		expect(values).toMatchObject({ kind: 'language', languageB: 'en-GB' });
	});

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
