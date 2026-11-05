import type { CardInput, Direction } from '../cards/types';
import type { LanguagePair } from '../decks/decks.service';
import { comparisonKey } from '../text';
import {
	TranslatorError,
	type TranslateRequest,
	type TranslationFailure,
	type Translator
} from './translator';

export type TranslationService = ReturnType<typeof createTranslationService>;

/** Suggestion de traduction, ou raison explicite de son absence. */
export type Suggestion = { ok: true; text: string } | { ok: false; reason: TranslationFailure };

/** Second avis sur une carte, dans les deux sens (outils MCP `check_card` et `check_cards`). */
export interface CardCheck {
	aToB: Suggestion;
	bToA: Suggestion;
}

/** Demande de traduction de textes dans un sens de la paire (`a_to_b` : de A vers B). */
function requestFor(
	{ languageA, languageB }: LanguagePair,
	direction: Direction,
	texts: string[],
	context?: string | null
): TranslateRequest {
	const [from, to] = direction === 'a_to_b' ? [languageA, languageB] : [languageB, languageA];
	return { texts: texts.map((text) => text.trim()), from, to, context: context?.trim() };
}

/** Suggestion obtenue de DeepL. */
type Answered = Extract<Suggestion, { ok: true }>;

/** Clé de comparaison d'une traduction : casse, espaces et ponctuation finale ignorés. */
const translationKey = (text: string) => comparisonKey(text).replace(/[\s.,;:!?…]+$/u, '');

/**
 * Vrai si DeepL contredit la carte dans les deux sens : sa traduction de A ne correspond pas
 * à B, ni sa traduction de B à A. Un seul sens qui correspond suffit (synonymes, tournures
 * idiomatiques). Faux quand DeepL n'a pas répondu.
 */
export function diverges(
	{ sideA, sideB }: CardInput,
	check: CardCheck
): check is { aToB: Answered; bToA: Answered } {
	const { aToB, bToA } = check;
	return (
		aToB.ok &&
		bToA.ok &&
		translationKey(aToB.text) !== translationKey(sideB) &&
		translationKey(bToA.text) !== translationKey(sideA)
	);
}

/** `translator` vaut `null` quand aucune clé DeepL n'est configurée. */
export function createTranslationService(translator: Translator | null) {
	/** Une suggestion par texte de la demande ; un échec vaut pour tous ses textes. */
	async function suggestAll(request: TranslateRequest): Promise<Suggestion[]> {
		const failed = (reason: TranslationFailure) =>
			request.texts.map((): Suggestion => ({ ok: false, reason }));
		if (!translator) return failed('not_configured');
		try {
			const texts = await translator.translate(request);
			return texts.map((text) => ({ ok: true, text }));
		} catch (error) {
			if (error instanceof TranslatorError) return failed(error.reason);
			console.error(error);
			return failed('unavailable');
		}
	}

	/**
	 * Traduit une face de chaque carte, en une demande par contexte : les cartes d'une même
	 * source partagent souvent le leur.
	 */
	async function translateFaces(
		pair: LanguagePair,
		direction: Direction,
		cards: readonly CardInput[]
	): Promise<Suggestion[]> {
		const side = direction === 'a_to_b' ? 'sideA' : 'sideB';
		const byContext = Map.groupBy(cards.keys(), (i) => cards[i].context?.trim() ?? '');
		const suggestions: Suggestion[] = [];
		await Promise.all(
			[...byContext].map(async ([context, indexes]) => {
				const texts = indexes.map((i) => cards[i][side]);
				const results = await suggestAll(requestFor(pair, direction, texts, context || null));
				indexes.forEach((i, k) => (suggestions[i] = results[k]));
			})
		);
		return suggestions;
	}

	/** Second avis sur chaque carte d'un lot, dans les deux sens. */
	async function checkAll(pair: LanguagePair, cards: readonly CardInput[]): Promise<CardCheck[]> {
		const [aToB, bToA] = await Promise.all([
			translateFaces(pair, 'a_to_b', cards),
			translateFaces(pair, 'b_to_a', cards)
		]);
		return cards.map((_, i) => ({ aToB: aToB[i], bToA: bToA[i] }));
	}

	return {
		/**
		 * Traduction d'une face vers la langue de l'autre, en tenant compte du contexte :
		 * `a_to_b` traduit la face A, `b_to_a` la face B.
		 */
		async suggest(
			pair: LanguagePair,
			direction: Direction,
			text: string,
			context?: string | null
		): Promise<Suggestion> {
			const [suggestion] = await suggestAll(requestFor(pair, direction, [text], context));
			return suggestion;
		},

		async check(pair: LanguagePair, card: CardInput): Promise<CardCheck> {
			const [check] = await checkAll(pair, [card]);
			return check;
		},

		checkAll
	};
}
