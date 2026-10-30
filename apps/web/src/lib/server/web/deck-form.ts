import { NEW_DECK_VALUES, type DeckFormValues } from '#lib/format/decks.js';
import type { Deck, DeckInput, DeckUpdate } from '#lib/server/domain/index.js';
import { parseValues, text } from './form-data';
import { deckUpdateSchema, newDeckSchema } from './schemas/decks';

// Formulaire de deck (création et modification) : lecture. La validation est dans
// `schemas/decks.ts`.

export type DeckErrors = Partial<Record<keyof DeckFormValues, string>>;

/** Message d'un nom de deck déjà pris (`ConflictError` du domaine). */
export const NAME_TAKEN = 'Tu as déjà un deck de ce nom.';

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

type Read<T> = { values: DeckFormValues; errors: DeckErrors; input: T | null };

/** Nouveau deck : une langue (deux langues différentes) ou un sujet (noms des faces). */
export function readNewDeckForm(form: FormData): Read<DeckInput> {
	const values = valuesOf(form, text(form, 'kind') === 'subject' ? 'subject' : 'language');
	return { values, ...parseValues(values, newDeckSchema) };
}

/**
 * Modification : nom, option des deux sens et noms des faces (ignorés pour une langue par
 * `decks.update`). Le type et les langues viennent du deck enregistré.
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
	return { values, ...parseValues(values, deckUpdateSchema) };
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
