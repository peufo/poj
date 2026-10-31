import { describe, expect, it } from 'vitest';
import type * as z from 'zod';
import { parseValues } from '../form-data';
import {
	cardFormSchema,
	cardSchema,
	cardsSearchSchema,
	cardTranslationSchema,
	dailyGoalSchema,
	newCardFormSchema,
	newCardSchema
} from './cards';

const DECK = '0199a0a0-0000-7000-8000-000000000000';

/** Premier message de chaque champ refusé. */
const errors = (schema: z.ZodType, values: Record<string, unknown>) =>
	parseValues(values, schema).errors;

describe('card form', () => {
	it('trims the faces and the context', () => {
		expect(cardSchema.parse({ sideA: ' chat ', sideB: ' cat ', context: ' ' })).toEqual({
			sideA: 'chat',
			sideB: 'cat',
			context: ''
		});
		expect(cardSchema.parse({ sideA: 'chat', sideB: 'cat' })).toEqual({
			sideA: 'chat',
			sideB: 'cat'
		});
	});

	it('requires both faces and limits their length', () => {
		expect(errors(cardSchema, { sideA: ' ', sideB: '', context: '' })).toEqual({
			sideA: 'Ce champ est obligatoire.',
			sideB: 'Ce champ est obligatoire.'
		});
		expect(
			errors(cardSchema, { sideA: 'x'.repeat(301), sideB: 'cat', context: 'x'.repeat(1001) })
		).toEqual({ sideA: '300 caractères au plus.', context: '1000 caractères au plus.' });
	});

	it('requires a deck to create a card, along with the other fields', () => {
		expect(errors(newCardSchema, { sideA: '', sideB: 'cat', deckId: '' })).toEqual({
			sideA: 'Ce champ est obligatoire.',
			deckId: 'Choisis un deck.'
		});
		expect(newCardSchema.parse({ sideA: 'chat', sideB: 'cat', deckId: DECK }).deckId).toBe(DECK);
	});

	it('needs only the text to translate for a suggestion', () => {
		expect(cardTranslationSchema.parse({ sideA: ' chat ', sideB: '' })).toEqual({ sideA: 'chat' });
		expect(errors(cardTranslationSchema, { sideA: ' ' })).toEqual({
			sideA: 'Écris d’abord le texte à traduire.'
		});
	});
});

describe('card form intents', () => {
	it('saves a card with both faces, keeping the confirmed duplicate', () => {
		expect(
			newCardFormSchema.parse({
				intent: 'save',
				deckId: DECK,
				sideA: ' chat ',
				sideB: 'cat',
				confirm: 'chat'
			})
		).toEqual({ intent: 'save', deckId: DECK, sideA: 'chat', sideB: 'cat', confirm: 'chat' });
		expect(
			errors(newCardFormSchema, { intent: 'save', deckId: DECK, sideA: 'chat', sideB: '' })
		).toEqual({
			sideB: 'Ce champ est obligatoire.'
		});
	});

	it('asks DeepL without the second face', () => {
		expect(cardFormSchema.parse({ intent: 'translate', sideA: 'chat', sideB: '' })).toEqual({
			intent: 'translate',
			sideA: 'chat'
		});
		expect(errors(cardFormSchema, { intent: 'translate', sideA: ' ' })).toEqual({
			sideA: 'Écris d’abord le texte à traduire.'
		});
	});

	it('keeps the acknowledged progress reset of an edit', () => {
		expect(
			cardFormSchema.parse({ intent: 'save', sideA: 'a', sideB: 'b', acknowledge_reset: '1' })
		).toMatchObject({ acknowledge_reset: '1' });
	});

	it('refuses a submission without its button', () => {
		expect(newCardFormSchema.safeParse({ deckId: DECK, sideA: 'a', sideB: 'b' }).success).toBe(
			false
		);
	});
});

describe('daily goal', () => {
	it('takes a whole number between 1 and 20', () => {
		expect(dailyGoalSchema.parse({ goal: 20 })).toEqual({ goal: 20 });
		for (const goal of [0, 21, 1.5, Number.NaN, undefined]) {
			expect(errors(dailyGoalSchema, { goal })).toEqual({
				goal: 'Entre 1 et 20 cartes par jour.'
			});
		}
	});
});

describe('cards search', () => {
	it('keeps a trimmed query of at most 200 characters', () => {
		expect(cardsSearchSchema.parse({})).toEqual({ q: '' });
		expect(cardsSearchSchema.parse({ q: ' chat ', deck: DECK })).toEqual({ q: 'chat' });
		expect(cardsSearchSchema.parse({ q: 'x'.repeat(250) }).q).toHaveLength(200);
	});
});
