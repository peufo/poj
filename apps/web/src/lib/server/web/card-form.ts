import { fail } from '@sveltejs/kit';
import type * as z from 'zod';
import {
	duplicateSide,
	languagePair,
	type CardInput,
	type CardsService,
	type Deck,
	type Suggestion,
	type TranslationFailure
} from '#lib/server/domain/index.js';
import { parseValues, text } from './form-data';
import { translation } from './services';

// Formulaire de carte (création et modification) : lecture, suggestion DeepL, doublons.
// La validation est dans `schemas/cards.ts`.

/** Champs saisis ; `deckId` : le deck choisi à la création (vide en modification). */
export type CardValues = { sideA: string; sideB: string; context: string; deckId: string };
export type CardErrors = Partial<Record<keyof CardValues, string>>;

/** Suggestion telle que la page l'affiche. */
export type SuggestionView =
	{ status: 'ready'; text: string } | { status: 'error'; message: string };

const failureMessages: Record<TranslationFailure, string> = {
	not_configured:
		"DeepL n'est pas configuré sur ce serveur (clé DEEPL_API_KEY absente). Tu peux enregistrer sans suggestion.",
	auth: 'DeepL refuse la clé configurée. Tu peux enregistrer sans suggestion.',
	quota: 'Le quota DeepL du mois est atteint. Tu peux enregistrer sans suggestion.',
	unavailable: 'DeepL ne répond pas pour le moment. Tu peux enregistrer sans suggestion.'
};

export function suggestionView(suggestion: Suggestion): SuggestionView {
	return suggestion.ok
		? { status: 'ready', text: suggestion.text }
		: { status: 'error', message: failureMessages[suggestion.reason] };
}

/** Valeurs saisies, renvoyées telles quelles à la page, et leur lecture par `schema`. */
export function readCardForm<T>(
	form: FormData,
	schema: z.ZodType<T, unknown>
): { values: CardValues; errors: CardErrors; input: T | null } {
	const values = {
		sideA: text(form, 'sideA'),
		sideB: text(form, 'sideB'),
		context: text(form, 'context'),
		deckId: text(form, 'deckId')
	};
	return { values, ...parseValues(values, schema) };
}

/**
 * Doublon en deux temps : un premier envoi avertit (échec 409 à renvoyer), un second
 * enregistre si la face qui identifie la carte (`duplicateSide`) est confirmée telle quelle
 * (`confirm`). `null` : rien à signaler. En modification, `unchanged` est la face
 * enregistrée : la garder ne déclenche pas d'avertissement.
 */
export async function duplicateWarning(
	cards: CardsService,
	ownerId: string,
	deck: Deck,
	form: FormData,
	{ values, input }: { values: CardValues; input: CardInput },
	{ excludeId, unchanged }: { excludeId?: string; unchanged?: string } = {}
) {
	const key = values[duplicateSide(deck)].trim();
	if (key === unchanged || form.get('confirm') === key) return null;
	const [duplicate] = await cards.findDuplicates(ownerId, deck, input, { excludeId });
	if (!duplicate) return null;
	const { id, sideA, sideB, context } = duplicate;
	return fail(409, { values, duplicate: { id, sideA, sideB, context, forValue: key } });
}

/**
 * Action `translate`, une fois la demande lue (`cardTranslationSchema`) : la suggestion
 * DeepL de la face A dans la langue de la face B, avec le contexte s'il est renseigné. Un
 * sujet n'a pas de second avis DeepL.
 */
export async function translateCard(
	values: CardValues,
	deck: Deck,
	{ sideA, context }: { sideA: string; context?: string }
) {
	const pair = languagePair(deck);
	if (!pair) {
		return fail(400, {
			values,
			errors: { sideA: 'Pas de traduction DeepL pour ce deck.' } as CardErrors
		});
	}
	const suggestion = await translation.suggest(pair, sideA, context);
	return { values, suggestion: suggestionView(suggestion) };
}
