import { describe, expect, it } from 'vitest';
import { directionFaces, directionLabel, exampleFor, faces, type DeckFaces } from './decks';

const frEn: DeckFaces = {
	kind: 'language',
	languageA: 'fr',
	languageB: 'en-GB',
	labelA: null,
	labelB: null,
	bothDirections: true
};

const subject: DeckFaces = {
	kind: 'subject',
	languageA: null,
	languageB: null,
	labelA: null,
	labelB: null,
	bothDirections: false
};

describe('deck faces', () => {
	it('names the faces of a language deck after its languages, without the variant', () => {
		const { a, b } = faces(frEn);

		expect(a).toMatchObject({
			label: 'Français',
			name: 'français',
			the: 'le français',
			lang: 'fr'
		});
		expect(a).toMatchObject({ same: 'ce français', short: 'FR' });
		expect(b).toMatchObject({ label: 'Anglais', name: 'anglais', the: 'l’anglais', lang: 'en-GB' });
		expect(b).toMatchObject({ same: 'cet anglais', short: 'EN' });
		expect(exampleFor(b)).toBe('to hang in there');
	});

	it('defaults the faces of a subject to Question and Réponse, without language', () => {
		const { a, b } = faces(subject);

		expect(a).toMatchObject({ label: 'Question', the: '« Question »', lang: null, short: 'Q' });
		expect(b).toMatchObject({ label: 'Réponse', same: 'la même face « Réponse »', lang: null });
		expect(exampleFor(a)).toBeUndefined();
	});

	it('prefers the labels chosen for the deck', () => {
		const { a, b } = faces({ ...subject, labelA: 'Pays', labelB: 'Capitale' });
		expect([a.label, b.label, b.short]).toEqual(['Pays', 'Capitale', 'C']);
		expect(faces({ ...frEn, labelB: 'Expression' }).b).toMatchObject({
			label: 'Expression',
			lang: 'en-GB'
		});
	});

	it('labels each direction with the face shown, then the face to produce', () => {
		expect(directionLabel('a_to_b', frEn)).toBe('Français → anglais');
		expect(directionLabel('b_to_a', frEn)).toBe('Anglais → français');
		expect(directionLabel('a_to_b', { ...subject, labelA: 'Pays', labelB: 'Capitale' })).toBe(
			'Pays → Capitale'
		);
		expect(directionFaces('b_to_a', frEn).to.short).toBe('FR');
	});
});
