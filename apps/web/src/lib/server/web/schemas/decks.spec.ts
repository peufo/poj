import { describe, expect, it } from 'vitest';
import { parseValues } from '../form-data';
import { deckUpdateSchema, newDeckSchema } from './decks';

// Ce que reçoivent les remote functions des decks : une case non cochée est absente, les
// champs masqués de l'autre type sont envoyés quand même.

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
	labelB: 'Capitale'
};

/** Premier message de chaque champ refusé. */
const errorsOf = (values: Record<string, unknown>) => parseValues(values, newDeckSchema).errors;

describe('deck schemas', () => {
	it('reads an unchecked box as one direction only', () => {
		expect(newDeckSchema.parse({ kind: 'subject', name: 'Capitales' })).toEqual({
			kind: 'subject',
			name: 'Capitales',
			languageA: null,
			languageB: null,
			labelA: null,
			labelB: null,
			bothDirections: false
		});
		expect(deckUpdateSchema.parse({ name: 'Capitales' })).toEqual({
			name: 'Capitales',
			labelA: null,
			labelB: null,
			bothDirections: false
		});
	});

	it('requires the languages of a language deck', () => {
		const result = newDeckSchema.safeParse({ kind: 'language', name: 'Anglais', languageA: 'fr' });
		expect(result.error?.issues.map((issue) => [issue.path[0], issue.message])).toEqual([
			['languageB', 'Choisis une langue dans la liste.']
		]);
	});

	it('reads a language deck, without labels', () => {
		expect(newDeckSchema.parse(language)).toEqual({
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
		expect(newDeckSchema.parse(subject)).toEqual({
			name: 'Capitales',
			kind: 'subject',
			languageA: null,
			languageB: null,
			labelA: 'Pays',
			labelB: 'Capitale',
			bothDirections: false
		});
		expect(newDeckSchema.parse({ ...subject, labelA: ' ', labelB: '' })).toMatchObject({
			labelA: null,
			labelB: null
		});
	});

	it('requires a name and two different languages from the list', () => {
		expect(errorsOf({ ...language, name: '  ', languageB: 'en-US', languageA: 'en-GB' })).toEqual({
			name: 'Le nom est obligatoire.',
			languageB: 'Choisis une autre langue que la langue connue.'
		});
		expect(errorsOf({ ...language, languageB: 'xx' })).toEqual({
			languageB: 'Choisis une langue dans la liste.'
		});
		expect(errorsOf({ ...language, languageB: '' })).toHaveProperty('languageB');
	});

	it('limits the name and the labels', () => {
		expect(errorsOf({ ...subject, name: 'x'.repeat(61), labelB: 'x'.repeat(41) })).toEqual({
			name: '60 caractères au plus.',
			labelB: '40 caractères au plus.'
		});
	});

	it('updates the name, the directions and the labels, never the kind or the languages', () => {
		expect(deckUpdateSchema.parse({ ...subject, kind: 'language', bothDirections: true })).toEqual({
			name: 'Capitales',
			labelA: 'Pays',
			labelB: 'Capitale',
			bothDirections: true
		});
	});
});
