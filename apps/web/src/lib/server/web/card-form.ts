import { fail } from '@sveltejs/kit';
import { capitalize, faces, type DeckFaces } from '#lib/format/decks.js';
import {
	languagePair,
	type CardInput,
	type Deck,
	type Suggestion,
	type TranslationFailure
} from '#lib/server/domain/index.js';
import { translation } from './services';

// Formulaire de carte (création et modification) : lecture, validation, suggestion DeepL.

export const LIMITS = { sideA: 300, sideB: 300, context: 1000 } as const;

export type CardValues = { sideA: string; sideB: string; context: string };
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

const text = (form: FormData, name: string) => form.get(name)?.toString() ?? '';

export function readCardForm(
	form: FormData,
	deck: DeckFaces
): {
	values: CardValues;
	errors: CardErrors;
	input: CardInput | null;
} {
	const { a, b } = faces(deck);
	const values = {
		sideA: text(form, 'sideA'),
		sideB: text(form, 'sideB'),
		context: text(form, 'context')
	};
	const errors: CardErrors = {};
	if (!values.sideA.trim()) errors.sideA = `${capitalize(a.the)} est obligatoire.`;
	if (!values.sideB.trim()) errors.sideB = `${capitalize(b.the)} est obligatoire.`;
	for (const field of ['sideA', 'sideB', 'context'] as const) {
		if (values[field].trim().length > LIMITS[field]) {
			errors[field] = `${LIMITS[field]} caractères au plus.`;
		}
	}
	const valid = Object.keys(errors).length === 0;
	return { values, errors, input: valid ? values : null };
}

/**
 * Action `translate` : la suggestion DeepL de la face A dans la langue de la face B, avec
 * le contexte s'il est renseigné. Un sujet n'a pas de second avis DeepL.
 */
export async function translateAction(form: FormData, deck: Deck) {
	const { values } = readCardForm(form, deck);
	const pair = languagePair(deck);
	if (!pair) {
		return fail(400, {
			values,
			errors: { sideA: 'Pas de traduction DeepL pour ce deck.' } as CardErrors
		});
	}
	if (!values.sideA.trim()) {
		return fail(400, {
			values,
			errors: { sideA: `Écris d’abord ${faces(deck).a.the} à traduire.` } as CardErrors
		});
	}
	if (values.sideA.trim().length > LIMITS.sideA || values.context.trim().length > LIMITS.context) {
		return fail(400, { values, errors: { sideA: 'Texte trop long pour DeepL.' } as CardErrors });
	}
	const suggestion = await translation.suggest(pair, values.sideA, values.context);
	return { values, suggestion: suggestionView(suggestion) };
}
