import * as z from 'zod';
import { baseLanguage, NEW_DECK_VALUES, type DeckFormValues } from '#lib/format/decks.js';
import { isDeckLanguage } from '#lib/format/languages.js';
import type { Deck, DeckInput, DeckUpdate } from '#lib/server/domain/index.js';
import { text } from './card-form';

// Formulaire de deck (création et modification) : lecture et validation (Zod).

export const DECK_LIMITS = { name: 60, label: 40 } as const;

export type DeckErrors = Partial<Record<keyof DeckFormValues, string>>;

/** Message d'un nom de deck déjà pris (`ConflictError` du domaine). */
export const NAME_TAKEN = 'Tu as déjà un deck de ce nom.';

const name = z
	.string()
	.trim()
	.min(1, 'Le nom est obligatoire.')
	.max(DECK_LIMITS.name, `${DECK_LIMITS.name} caractères au plus.`);

/** Nom d'une face : vide, c'est « Question » / « Réponse ». */
const label = z
	.string()
	.trim()
	.max(DECK_LIMITS.label, `${DECK_LIMITS.label} caractères au plus.`)
	.transform((value) => value || null);

const language = z.string().refine(isDeckLanguage, 'Choisis une langue dans la liste.');

const languageDeck = z
	.object({ name, languageA: language, languageB: language, bothDirections: z.boolean() })
	// Zod vérifie l'objet même si une langue est déjà refusée : rien à comparer alors.
	.refine(
		({ languageA, languageB }) =>
			!isDeckLanguage(languageA) ||
			!isDeckLanguage(languageB) ||
			baseLanguage(languageA) !== baseLanguage(languageB),
		{
			path: ['languageB'],
			message: 'Choisis une autre langue que la langue connue.'
		}
	);

const subjectDeck = z.object({ name, labelA: label, labelB: label, bothDirections: z.boolean() });

/** Ce qui se modifie d'un deck de langue : ni ses langues, ni les noms de ses faces. */
const languageEdit = subjectDeck.pick({ name: true, bothDirections: true });

function valuesOf(form: FormData, kind: DeckFormValues['kind']): DeckFormValues {
	return {
		name: text(form, 'name'),
		kind,
		languageA: text(form, 'languageA'),
		languageB: text(form, 'languageB'),
		labelA: text(form, 'labelA'),
		labelB: text(form, 'labelB'),
		bothDirections: form.has('bothDirections')
	};
}

/** Premier message de chaque champ en erreur. */
function errorsOf(error: z.ZodError): DeckErrors {
	const errors: DeckErrors = {};
	for (const issue of error.issues) {
		errors[issue.path[0] as keyof DeckFormValues] ??= issue.message;
	}
	return errors;
}

type Read<T> = { values: DeckFormValues; errors: DeckErrors; input: T | null };

function read<T, U>(
	values: DeckFormValues,
	schema: z.ZodType<T, unknown>,
	toInput: (data: T) => U
): Read<U> {
	const parsed = schema.safeParse(values);
	return parsed.success
		? { values, errors: {}, input: toInput(parsed.data) }
		: { values, errors: errorsOf(parsed.error), input: null };
}

/** Nouveau deck : une langue (deux langues différentes) ou un sujet (noms des faces). */
export function readNewDeckForm(form: FormData): Read<DeckInput> {
	if (text(form, 'kind') === 'subject') {
		return read(valuesOf(form, 'subject'), subjectDeck, (deck) => ({
			...deck,
			kind: 'subject' as const,
			languageA: null,
			languageB: null
		}));
	}
	return read(valuesOf(form, 'language'), languageDeck, (deck) => ({
		...deck,
		kind: 'language' as const,
		labelA: null,
		labelB: null
	}));
}

/**
 * Modification : nom, option des deux sens et, pour un sujet, noms des faces. Le type et
 * les langues viennent du deck enregistré.
 */
export function readDeckEditForm(
	form: FormData,
	deck: Pick<Deck, 'kind' | 'languageA' | 'languageB'>
): Read<DeckUpdate> {
	const values = {
		...valuesOf(form, deck.kind),
		languageA: deck.languageA ?? '',
		languageB: deck.languageB ?? ''
	};
	const schema: z.ZodType<DeckUpdate, unknown> =
		deck.kind === 'subject' ? subjectDeck : languageEdit;
	return read(values, schema, (update) => update);
}

/**
 * Valeurs du formulaire de modification, depuis le deck enregistré. Un sujet sans noms de
 * faces affiche « Question » / « Réponse », comme à la création.
 */
export function deckFormValues(deck: Deck): DeckFormValues {
	return {
		name: deck.name,
		kind: deck.kind,
		languageA: deck.languageA ?? '',
		languageB: deck.languageB ?? '',
		labelA: deck.labelA ?? NEW_DECK_VALUES.labelA,
		labelB: deck.labelB ?? NEW_DECK_VALUES.labelB,
		bothDirections: deck.bothDirections
	};
}
