import { fail } from '@sveltejs/kit';
import type { CardInput, Suggestion, TranslationFailure } from '#lib/server/domain/index.js';
import { translation } from './services';

// Formulaire de carte (création et modification) : lecture, validation, suggestion DeepL.

export const LIMITS = { french: 300, english: 300, context: 1000 } as const;

export type CardValues = { french: string; english: string; context: string };
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

export function readCardForm(form: FormData): {
	values: CardValues;
	errors: CardErrors;
	input: CardInput | null;
} {
	const values = {
		french: text(form, 'french'),
		english: text(form, 'english'),
		context: text(form, 'context')
	};
	const errors: CardErrors = {};
	if (!values.french.trim()) errors.french = 'Le français est obligatoire.';
	if (!values.english.trim()) errors.english = "L'anglais est obligatoire.";
	for (const field of ['french', 'english', 'context'] as const) {
		if (values[field].trim().length > LIMITS[field]) {
			errors[field] = `${LIMITS[field]} caractères au plus.`;
		}
	}
	const valid = Object.keys(errors).length === 0;
	return { values, errors, input: valid ? values : null };
}

/** Action `translate` : la suggestion DeepL du français, avec le contexte s'il est renseigné. */
export async function translateAction(form: FormData) {
	const { values } = readCardForm(form);
	if (!values.french.trim()) {
		return fail(400, {
			values,
			errors: { french: 'Écris d’abord le français à traduire.' } as CardErrors
		});
	}
	if (
		values.french.trim().length > LIMITS.french ||
		values.context.trim().length > LIMITS.context
	) {
		return fail(400, { values, errors: { french: 'Texte trop long pour DeepL.' } as CardErrors });
	}
	const suggestion = await translation.suggestEnglish(values.french, values.context);
	return { values, suggestion: suggestionView(suggestion) };
}
