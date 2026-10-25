import type { CardInput } from '../cards/types';
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
	frenchToEnglish: Suggestion;
	englishToFrench: Suggestion;
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
		/** Traduction du français vers l'anglais, en tenant compte du contexte. */
		suggestEnglish(french: string, context?: string | null): Promise<Suggestion> {
			return suggest({ text: french.trim(), from: 'fr', to: 'en', context: context?.trim() });
		},

		async check({ french, english, context }: CardInput): Promise<CardCheck> {
			const ctx = context?.trim();
			const [frenchToEnglish, englishToFrench] = await Promise.all([
				suggest({ text: french.trim(), from: 'fr', to: 'en', context: ctx }),
				suggest({ text: english.trim(), from: 'en', to: 'fr', context: ctx })
			]);
			return { frenchToEnglish, englishToFrench };
		}
	};
}
