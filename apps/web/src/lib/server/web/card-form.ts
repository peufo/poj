import { invalid } from '@sveltejs/kit';
import type { RemoteForm } from '$app/server';
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
import type { cardFormSchema, newCardFormSchema } from './schemas/cards';
import { translation } from './services';

// Formulaire de carte (création et modification) : suggestion DeepL et doublons. La
// validation est dans `schemas/cards.ts`.

/** Carte déjà présente avec la même face, signalée avant d'enregistrer (`findDuplicate`). */
export type DuplicateView = {
	id: string;
	sideA: string;
	sideB: string;
	context: string | null;
	/** Face vérifiée, à renvoyer telle quelle (`confirm`) pour enregistrer quand même. */
	forValue: string;
	deckId: string;
};

/**
 * Résultat d'un envoi du formulaire de carte qui ne redirige pas : la suggestion DeepL, un
 * doublon à confirmer, ou (en modification) l'avertissement de réinitialisation.
 */
export type CardFormResult =
	{ suggestion: SuggestionView } | { duplicate: DuplicateView } | { resetWarning: true };

/** Remote form de la création d'une carte (`createCard`), tel que `CardForm` le reçoit. */
export type NewCardForm = RemoteForm<z.input<typeof newCardFormSchema>, CardFormResult>;

/** Remote form de la modification d'une carte (`updateCard`). */
export type CardEditForm = RemoteForm<z.input<typeof cardFormSchema>, CardFormResult>;

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

/**
 * Doublon en deux temps : un premier envoi renvoie la carte existante, à signaler ; un
 * second enregistre si la face qui identifie la carte (`duplicateSide`) est confirmée telle
 * quelle (`confirm`). `null` : rien à signaler. En modification, `unchanged` est la face
 * enregistrée : la garder ne déclenche pas d'avertissement.
 */
export async function findDuplicate(
	cards: CardsService,
	ownerId: string,
	deck: Deck,
	input: CardInput & { confirm?: string },
	{ excludeId, unchanged }: { excludeId?: string; unchanged?: string } = {}
): Promise<DuplicateView | null> {
	const key = input[duplicateSide(deck)];
	if (key === unchanged || input.confirm === key) return null;
	const [duplicate] = await cards.findDuplicates(ownerId, deck, input, { excludeId });
	if (!duplicate) return null;
	const { id, sideA, sideB, context } = duplicate;
	return { id, sideA, sideB, context, forValue: key, deckId: deck.id };
}

/**
 * Suggestion DeepL de la face A dans la langue de la face B, avec le contexte s'il est
 * renseigné. Un sujet n'a pas de second avis DeepL : erreur sur la face A.
 */
export async function translateCard(
	deck: Deck,
	{ sideA, context }: { sideA: string; context?: string }
) {
	const pair = languagePair(deck);
	if (!pair) invalid({ message: 'Pas de traduction DeepL pour ce deck.', path: ['sideA'] });
	const suggestion = await translation.suggest(pair, sideA, context);
	return { suggestion: suggestionView(suggestion) };
}
