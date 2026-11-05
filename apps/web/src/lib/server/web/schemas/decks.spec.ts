import { describe, expect, it } from 'vitest';
import { fieldErrors } from '../../testing/schemas';
import { deckUpdateSchema, newDeckSchema } from './decks';

// Ce que reçoivent les remote functions des decks : une case non cochée est absente, les
// champs masqués de l'autre type sont envoyés quand même.

const language = {
	kind: 'language',
	languageA: 'fr',
	languageB: 'en-GB',
	// Les champs du sujet, masqués, sont postés quand même : ignorés.
	name: '',
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
const errorsOf = (values: Record<string, unknown>) => fieldErrors(newDeckSchema, values);

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
		expect(deckUpdateSchema.parse({ name: 'Capitales', newCardsPerDay: 10 })).toEqual({
			name: 'Capitales',
			labelA: null,
			labelB: null,
			bothDirections: false,
			newCardsPerDay: 10
		});
	});

	it('requires the languages of a language deck', () => {
		const result = newDeckSchema.safeParse({ kind: 'language', languageA: 'fr' });
		expect(result.error?.issues.map((issue) => [issue.path[0], issue.message])).toEqual([
			['languageB', 'Choisis une langue dans la liste.']
		]);
	});

	it('reads a language deck, without name (its learned language) nor labels', () => {
		expect(newDeckSchema.parse({ ...language, name: 'Ignoré' })).toEqual({
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

	it('requires the name of a subject only', () => {
		expect(errorsOf({ ...subject, name: '  ' })).toEqual({ name: 'Le nom est obligatoire.' });
		expect(errorsOf({ kind: 'subject' })).toEqual({ name: 'Le nom est obligatoire.' });
		expect(errorsOf(language)).toEqual({});
	});

	it('requires two different languages from the list', () => {
		expect(errorsOf({ ...language, languageB: 'en-US', languageA: 'en-GB' })).toEqual({
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
		expect(
			deckUpdateSchema.parse({
				...subject,
				kind: 'language',
				bothDirections: true,
				newCardsPerDay: 20
			})
		).toEqual({
			name: 'Capitales',
			labelA: 'Pays',
			labelB: 'Capitale',
			bothDirections: true,
			newCardsPerDay: 20
		});
		// Une langue n'a pas de champ nom : il reste celui de sa langue apprise.
		expect(deckUpdateSchema.parse({ bothDirections: true, newCardsPerDay: 10 })).toEqual({
			labelA: null,
			labelB: null,
			bothDirections: true,
			newCardsPerDay: 10
		});
	});

	it('bounds the new cards per day', () => {
		const message = 'Entre 1 et 100 cartes par jour.';
		for (const newCardsPerDay of [0, 101, 2.5, undefined]) {
			expect(fieldErrors(deckUpdateSchema, { name: 'Capitales', newCardsPerDay })).toEqual({
				newCardsPerDay: message
			});
		}
	});
});
