import type { CardInput, Direction } from '../cards/types';
import type { LanguagePair } from '../decks/decks.service';
import {
	TranslatorError,
	type TranslateRequest,
	type TranslationFailure,
	type Translator
} from './translator';

export type TranslationService = ReturnType<typeof createTranslationService>;

/** Suggestion de traduction, ou raison explicite de son absence. */
export type Suggestion = { ok: true; text: string } | { ok: false; reason: TranslationFailure };

/** Second avis sur une carte, dans les deux sens (outil MCP `check_card`). */
export interface CardCheck {
	aToB: Suggestion;
	bToA: Suggestion;
}

/** Demande de traduction d'un texte dans un sens de la paire (`a_to_b` : de A vers B). */
function requestFor(
	{ languageA, languageB }: LanguagePair,
	direction: Direction,
	text: string,
	context?: string | null
): TranslateRequest {
	const [from, to] = direction === 'a_to_b' ? [languageA, languageB] : [languageB, languageA];
	return { text: text.trim(), from, to, context: context?.trim() };
}

/** `translator` vaut `null` quand aucune clé DeepL n'est configurée. */
export function createTranslationService(translator: Translator | null) {
	async function suggest(request: TranslateRequest): Promise<Suggestion> {
		if (!translator) return { ok: false, reason: 'not_configured' };
		try {
			return { ok: true, text: await translator.translate(request) };
		} catch (error) {
			if (error instanceof TranslatorError) return { ok: false, reason: error.reason };
			console.error(error);
			return { ok: false, reason: 'unavailable' };
		}
	}

	return {
		/**
		 * Traduction d'une face vers la langue de l'autre, en tenant compte du contexte :
		 * `a_to_b` traduit la face A, `b_to_a` la face B.
		 */
		suggest(
			pair: LanguagePair,
			direction: Direction,
			text: string,
			context?: string | null
		): Promise<Suggestion> {
			return suggest(requestFor(pair, direction, text, context));
		},

		async check(pair: LanguagePair, { sideA, sideB, context }: CardInput): Promise<CardCheck> {
			const [aToB, bToA] = await Promise.all([
				suggest(requestFor(pair, 'a_to_b', sideA, context)),
				suggest(requestFor(pair, 'b_to_a', sideB, context))
			]);
			return { aToB, bToA };
		}
	};
}
