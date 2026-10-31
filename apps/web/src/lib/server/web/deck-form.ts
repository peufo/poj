import { NEW_DECK_VALUES, type DeckFormValues } from '#lib/format/decks.js';
import type { Deck } from '#lib/server/domain/index.js';

// Formulaire de deck (création et modification). La validation est dans `schemas/decks.ts`.

/** Message d'un nom de deck déjà pris (`ConflictError` du domaine). */
export const NAME_TAKEN = 'Tu as déjà un deck de ce nom.';

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
