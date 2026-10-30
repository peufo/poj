import * as z from 'zod';
import { baseLanguage } from '#lib/format/decks.js';
import { isDeckLanguage } from '#lib/format/languages.js';
import type { DeckInput, DeckUpdate } from '#lib/server/domain/index.js';
import { tooLong } from './fields';

// Formulaires des decks : création (une langue ou un sujet) et modification.

const DECK_LIMITS = { name: 60, label: 40 } as const;

const name = z
	.string()
	.trim()
	.min(1, 'Le nom est obligatoire.')
	.max(DECK_LIMITS.name, tooLong(DECK_LIMITS.name));

/** Nom d'une face : vide, c'est « Question » / « Réponse ». */
const label = z
	.string()
	.trim()
	.max(DECK_LIMITS.label, tooLong(DECK_LIMITS.label))
	.optional()
	.transform((value) => value || null);

/** Case à cocher : absente du formulaire quand elle n'est pas cochée. */
const bothDirections = z.boolean().default(false);

const field = z.string().default('');

/**
 * Nouveau deck : une langue (deux langues différentes de la liste) ou un sujet (noms des
 * faces). Les champs de l'autre type, masqués, sont postés quand même : ignorés.
 */
export const newDeckSchema = z
	.object({
		kind: z.enum(['language', 'subject']),
		name,
		languageA: field,
		languageB: field,
		labelA: field,
		labelB: field,
		bothDirections
	})
	.superRefine((deck, ctx) => {
		const issue = (path: keyof typeof deck, message: string) =>
			ctx.addIssue({ code: 'custom', path: [path], message, input: deck[path] });
		if (deck.kind === 'subject') {
			for (const path of ['labelA', 'labelB'] as const) {
				if (deck[path].trim().length > DECK_LIMITS.label) issue(path, tooLong(DECK_LIMITS.label));
			}
			return;
		}
		const { languageA, languageB } = deck;
		for (const path of ['languageA', 'languageB'] as const) {
			if (!isDeckLanguage(deck[path])) issue(path, 'Choisis une langue dans la liste.');
		}
		if (
			isDeckLanguage(languageA) &&
			isDeckLanguage(languageB) &&
			baseLanguage(languageA) === baseLanguage(languageB)
		) {
			issue('languageB', 'Choisis une autre langue que la langue connue.');
		}
	})
	.transform(({ kind, name, languageA, languageB, labelA, labelB, bothDirections }): DeckInput =>
		kind === 'language'
			? { kind, name, languageA, languageB, labelA: null, labelB: null, bothDirections }
			: {
					kind,
					name,
					languageA: null,
					languageB: null,
					labelA: labelA.trim() || null,
					labelB: labelB.trim() || null,
					bothDirections
				}
	);

/**
 * Modification : nom, option des deux sens et noms des faces. Le type et les langues ne
 * changent pas ; `decks.update` ignore les noms des faces d'une langue.
 */
export const deckUpdateSchema = z.object({
	name,
	labelA: label,
	labelB: label,
	bothDirections
}) satisfies z.ZodType<DeckUpdate, unknown>;
