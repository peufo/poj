// Langues proposées pour un deck de langue : celles que DeepL traduit dans les deux sens
// (https://developers.deepl.com/docs/getting-started/supported-languages). Étiquettes
// BCP 47 ; l'anglais et le portugais portent la variante que DeepL exige en langue cible.
import { capitalize } from './labels';

export const DECK_LANGUAGES = [
	'ar',
	'bg',
	'cs',
	'da',
	'de',
	'el',
	'en-GB',
	'en-US',
	'es',
	'et',
	'fi',
	'fr',
	'hu',
	'id',
	'it',
	'ja',
	'ko',
	'lt',
	'lv',
	'nb',
	'nl',
	'pl',
	'pt-BR',
	'pt-PT',
	'ro',
	'ru',
	'sk',
	'sl',
	'sv',
	'tr',
	'uk',
	'zh'
] as const;

export type DeckLanguage = (typeof DECK_LANGUAGES)[number];

export const isDeckLanguage = (tag: string): tag is DeckLanguage =>
	(DECK_LANGUAGES as readonly string[]).includes(tag);

const names = new Intl.DisplayNames('fr', { type: 'language', languageDisplay: 'standard' });

/** Nom d'une langue dans une liste, variante comprise : « Anglais (Royaume-Uni) ». */
export const languageOption = (tag: string) => capitalize(names.of(tag) ?? tag);

/** Les langues proposées, dans l'ordre alphabétique de leur nom. */
export const languageOptions: { value: DeckLanguage; label: string }[] = DECK_LANGUAGES.map(
	(value) => ({ value, label: languageOption(value) })
).sort((a, b) => a.label.localeCompare(b.label, 'fr'));
