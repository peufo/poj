import type { RemoteForm } from '$app/server';
import type * as z from 'zod';
import { NEW_DECK_VALUES, type DeckFormValues } from '#lib/format/decks.js';
import type { Deck } from '#lib/server/domain/index.js';
import type { deckUpdateSchema, newDeckSchema } from './schemas/decks';

// Formulaire de deck (création et modification). La validation est dans `schemas/decks.ts`.

/** Remote form de la création d'un deck (`createDeck`) : il redirige toujours. */
export type NewDeckForm = RemoteForm<z.input<typeof newDeckSchema>, never>;

/** Remote form de la modification d'un deck (`saveDeck`). */
export type DeckEditForm = RemoteForm<z.input<typeof deckUpdateSchema>, never>;

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
