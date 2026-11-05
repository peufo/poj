import { DomainError } from '../errors';

/**
 * Étiquette de langue BCP 47 (`fr`, `en-GB`) : la langue seule désigne la source, la
 * région éventuelle précise la variante cible (anglais britannique).
 */
export type Language = string;

/** Textes traduits ensemble, dans le même sens et avec le même contexte. */
export interface TranslateRequest {
	texts: string[];
	from: Language;
	to: Language;
	/** Situation d'origine : oriente la traduction sans être traduite. */
	context?: string | null;
}

/** Service de traduction externe (DeepL), fourni par l'appelant. */
export interface Translator {
	/** Une traduction par texte, dans l'ordre des textes. */
	translate(request: TranslateRequest): Promise<string[]>;
}

export type TranslationFailure = 'not_configured' | 'auth' | 'quota' | 'unavailable';

export class TranslatorError extends DomainError {
	constructor(
		readonly reason: Exclude<TranslationFailure, 'not_configured'>,
		message: string
	) {
		super(message);
	}
}
