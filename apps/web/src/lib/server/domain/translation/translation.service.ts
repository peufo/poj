import type { CardInput } from '../cards/types';
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
		/** Traduction de la face A vers la langue de la face B, en tenant compte du contexte. */
		suggest(
			{ languageA, languageB }: LanguagePair,
			sideA: string,
			context?: string | null
		): Promise<Suggestion> {
			return suggest({
				text: sideA.trim(),
				from: languageA,
				to: languageB,
				context: context?.trim()
			});
		},

		async check(
			{ languageA, languageB }: LanguagePair,
			{ sideA, sideB, context }: CardInput
		): Promise<CardCheck> {
			const ctx = context?.trim();
			const [aToB, bToA] = await Promise.all([
				suggest({ text: sideA.trim(), from: languageA, to: languageB, context: ctx }),
				suggest({ text: sideB.trim(), from: languageB, to: languageA, context: ctx })
			]);
			return { aToB, bToA };
		}
	};
}
