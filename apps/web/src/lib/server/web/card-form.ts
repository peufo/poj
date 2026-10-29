import { fail } from '@sveltejs/kit';
import { faces, type DeckFaces } from '#lib/format/decks.js';
import { capitalize } from '#lib/format/labels.js';
import {
	duplicateSide,
	languagePair,
	type CardInput,
	type CardsService,
	type Deck,
	type Suggestion,
	type TranslationFailure
} from '#lib/server/domain/index.js';
import { translation } from './services';

// Formulaire de carte (création et modification) : lecture, validation, suggestion DeepL.

export const LIMITS = { sideA: 300, sideB: 300, context: 1000 } as const;

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

/** Champ texte d'un formulaire posté, vide s'il est absent. */
export const text = (form: FormData, name: string) => form.get(name)?.toString() ?? '';

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
		context: text(form, 'context'),
		deckId: text(form, 'deckId')
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
 * Action `translate` : la suggestion DeepL de la face A dans la langue de la face B, avec
 * le contexte s'il est renseigné. Un sujet n'a pas de second avis DeepL.
 */
export async function translateAction(form: FormData, deck: Deck) {
	const { values } = readCardForm(form, deck);
	const refuse = (sideA: string) => fail(400, { values, errors: { sideA } as CardErrors });
	const pair = languagePair(deck);
	if (!pair) return refuse('Pas de traduction DeepL pour ce deck.');
	if (!values.sideA.trim()) return refuse(`Écris d’abord ${faces(deck).a.the} à traduire.`);
	if (values.sideA.trim().length > LIMITS.sideA || values.context.trim().length > LIMITS.context) {
		return refuse('Texte trop long pour DeepL.');
	}
	const suggestion = await translation.suggest(pair, values.sideA, values.context);
	return { values, suggestion: suggestionView(suggestion) };
}
