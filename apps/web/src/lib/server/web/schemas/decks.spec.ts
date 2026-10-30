import { describe, expect, it } from 'vitest';
import { deckUpdateSchema, newDeckSchema } from './decks';

// La lecture des formulaires postés est couverte par `deck-form.spec.ts` ; ici, la forme
// que reçoivent les remote functions : une case non cochée est absente.

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
});
